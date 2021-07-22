/*******************************************************************************
 *
 *    Copyright 2021 Adobe. All rights reserved.
 *    This file is licensed to you under the Apache License, Version 2.0 (the "License");
 *    you may not use this file except in compliance with the License. You may obtain a copy
 *    of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 *    Unless required by applicable law or agreed to in writing, software distributed under
 *    the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 *    OF ANY KIND, either express or implied. See the License for the specific language
 *    governing permissions and limitations under the License.
 *
 ******************************************************************************/

'use strict';

const { Core } = require('@adobe/aio-sdk');
const libState = require('@adobe/aio-lib-state');
const { errorResponse, stringParameters } = require('../utils');

const magentoSchema = require('../resources/magento-schema-2.4.2ee.min.json');
const { makeRemoteExecutableSchema, introspectSchema, mergeSchemas } = require('graphql-tools');
const { graphql, printSchema } = require('graphql');

const { Products, CategoryTree } = require('../common/Catalog.js');
const ProductsLoader = require('../common/ProductsLoader.js');
const CategoryTreeLoader = require('../common/CategoryTreeLoader.js');
const SchemaBuilder = require('../common/SchemaBuilder.js');
const RemoteResolverFetcher = require('../common/RemoteResolverFetcher.js');

let cachedSchema = null;

async function resolve(params) {
    const logger = Core.Logger('dispatcher', {
        level: params.LOG_LEVEL || 'info'
    });

    logger.info('dispatcher resolve action');
    logger.debug(stringParameters(params));

    let remoteResolvers = null;
    let state = null; // The aio-lib-state object
    let storeSchema = false; // If true, we will put the remote schemas in the aio-lib-state cache

    // If the schema is not cached, we try to get the remote schemas from the aio-lib-state cache
    if (cachedSchema == null && Number.isInteger(params['use-aio-cache'])) {
        state = await libState.init();
        remoteResolvers = await fetchRemoteSchemasFromCache(state);
    }

    // If the schema is not cached and we didn't get anything from the aio-lib-state cache,
    // we prepare the remote fetchers to build the executable remote schemas
    if (cachedSchema == null && params.remoteSchemas && remoteResolvers == null) {
        remoteResolvers = prepareRemoteSchemaFetchers(params.remoteSchemas);
        storeSchema = Number.isInteger(params['use-aio-cache']);
    }

    // The schema is already available, we use a NOOP Promise for Promise.all()
    if (remoteResolvers == null) {
        remoteResolvers = [Promise.resolve({})]; // Do nothing below
    }

    return Promise.all(remoteResolvers)
        .then(async (remotes) => {
            if (cachedSchema == null) {
                let remoteExecutableSchemas = [localSchema()];

                if (params.remoteSchemas) {
                    let cachedSchemas = [];

                    remotes.forEach((remote) => {
                        let remoteExecutableSchema = makeRemoteExecutableSchema({
                            schema: remote.schema,
                            fetcher: remote.fetcher
                        });
                        remoteExecutableSchema.sortOrder = remote.order;
                        remoteExecutableSchemas.push(remoteExecutableSchema);

                        // We store the remote schemas in SDL form in the aio-lib-state cache
                        if (storeSchema) {
                            cachedSchemas.push({
                                schema: printSchema(remote.schema),
                                action: remote.action,
                                order: remote.order
                            });
                        }
                    });

                    if (state && cachedSchemas.length > 0) {
                        let ttl = params['use-aio-cache'];
                        console.debug(`Trying to put schemas in aio-lib-state cache with ttl:${ttl} ...`);
                        await state.put('schemas', cachedSchemas, {
                            ttl
                        });
                    }
                }

                let finalSchema = mergeSchemas({
                    schemas: remoteExecutableSchemas,
                    onTypeConflict: onTypeConflict
                });

                cachedSchema = finalSchema; // eslint-disable-line require-atomic-updates
            }

            // Passed to all resolver actions, can for example contain an authentication token
            let context = {
                dummy: 'Can be some authentication token'
            };

            // We instantiate some loaders common to the "products" and "category" resolvers
            let categoryTreeLoader = new CategoryTreeLoader(params);
            let productsLoader = new ProductsLoader(params);

            // Local resolvers object
            let resolvers = {
                products: (params, context) => {
                    return new Products({
                        search: params,
                        graphqlContext: context,
                        actionParameters: params,
                        productsLoader: productsLoader,
                        categoryTreeLoader: categoryTreeLoader
                    });
                },
                category: (params, context) => {
                    return new CategoryTree({
                        categoryId: params.id,
                        graphqlContext: context,
                        actionParameters: params,
                        categoryTreeLoader: categoryTreeLoader,
                        productsLoader: productsLoader
                    });
                },
                categoryList: (params, context) => {
                    // returns an Array of categories
                    let categoryId = params.filters.ids
                        ? params.filters.ids.eq
                        : params.filters.url_key
                        ? params.filters.url_key.eq
                        : 1;
                    return [
                        new CategoryTree({
                            categoryId: categoryId,
                            graphqlContext: context,
                            actionParameters: params,
                            categoryTreeLoader: categoryTreeLoader,
                            productsLoader: productsLoader
                        })
                    ];
                },
                customAttributeMetadata: () => {
                    return null; // Not supported by example integration
                }
            };

            // Main resolver action, partially delegating resolution to the "remote schemas"
            return graphql(cachedSchema, params.query, resolvers, context, params.variables, params.operationName).then(
                (response) => {
                    logger.info(`successful request`);
                    return {
                        statusCode: 200,
                        body: response
                    };
                }
            );
        })
        .catch((error) => {
            logger.error(error);
            return errorResponse(500, 'server error', logger);
        });
}

/**
 * When merging schemas, this method keeps the data of the schema with lowest order.
 * The parameters are automatically passed by the graphql-tools library.
 */
function onTypeConflict(left, right, info) {
    let diff = info.left.schema.sortOrder - info.right.schema.sortOrder;
    return diff <= 0 ? left : right;
}

/**
 * This method prepares the introspection calls that will be used to get all the remote schemas
 * from all the remote actions.
 *
 * @param {*} remoteSchemas The remote schemas configured in the dispatcher action.
 */
function prepareRemoteSchemaFetchers(remoteSchemas) {
    // Get all resolver actions to fetch the remote schemas dynamically
    return Object.values(remoteSchemas).map((resolver) => {
        console.debug(`Preparing remote schema fetcher for action ${resolver.action}`);
        let fetcher = new RemoteResolverFetcher(resolver.action).fetcher;
        return introspectSchema(fetcher).then((schema) => {
            return Promise.resolve({
                schema,
                fetcher,
                order: resolver.order,
                action: resolver.action
            });
        });
    });
}

/**
 * This method checks if the SDL remote schemas are available in the aio-lib-state cache.
 * If successful, it returns an Array of remote resolvers that can be used to build the
 * executable remote schemas. It returns null if nothing could be fetched from the cache.
 */
async function fetchRemoteSchemasFromCache(state) {
    console.debug('Trying to get remote schemas from aio-lib-state cache ...');
    let schemas = await state.get('schemas');
    if (schemas) {
        console.debug(`Got ${schemas.value.length} schemas from aio-lib-state cache`);
        return schemas.value.map((obj) => {
            return Promise.resolve({
                schema: obj.schema,
                fetcher: new RemoteResolverFetcher(obj.action).fetcher,
                order: obj.order
            });
        });
    }
    return null;
}

/**
 * This method processes the default Magento schema and returns the modified schema.
 * It demonstrates how it is possible to modify the Magento schema, for example to remove
 * all unimplemented fields, customize GraphQL types, and add new types and fields to the
 * default Magento schema.
 */
function localSchema() {
    // The local schema only implements a limited set of fields of the Query root type
    let schemaBuilder = new SchemaBuilder(magentoSchema)
        .removeMutationType()
        .filterQueryFields(new Set(['products', 'category', 'customAttributeMetadata', 'categoryList']));

    // Add a new type and field under the Query root type
    // Note that when adding a field to an interface, you must also add it to all its implementation types
    // --> see the other examples below for a better method to add fields to interfaces
    schemaBuilder.extend(`
        extend type Query {
            # Fetches a shoppinglist by id
            shoppinglist(id: String!): Shoppinglist
        }

        type Shoppinglist {
            # The shoppinglist id
            id: String
            # The products in the shoppinglist
            products: [ProductInterface]
        }
    `);

    // Add some fields to the ProductInterface type and all its implementations
    schemaBuilder.addFieldToType('ProductInterface', 'rating', 'The rating of the product', 'String');
    schemaBuilder.addFieldToType(
        'ProductInterface',
        'accessories',
        'The accessories of the product',
        'ProductInterface',
        true
    );
    schemaBuilder.addFieldToType(
        'ProductInterface',
        'country_of_origin',
        'The code of the country where the product is manufactured',
        'CountryCodeEnum'
    );

    return schemaBuilder.build(10);
}

// Only exported for unit testing
function cleanCachedSchema() {
    cachedSchema = null;
}

module.exports.main = resolve;
module.exports.cleanCacheSchema = cleanCachedSchema;
