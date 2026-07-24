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

const magentoSchema = require('../resources/magento-schema-2.4.3ee.min.json');
const { wrapSchema, introspectSchema } = require('@graphql-tools/wrap');
const { stitchSchemas } = require('@graphql-tools/stitch');
const { addResolversToSchema } = require('@graphql-tools/schema');
const { graphql, printSchema, buildSchema } = require('graphql');

const { Products, CategoryTree } = require('../common/Catalog.js');
const ProductsLoader = require('../common/ProductsLoader.js');
const CategoryTreeLoader = require('../common/CategoryTreeLoader.js');
const SchemaBuilder = require('../common/SchemaBuilder.js');
const RemoteResolverFetcher = require('../common/RemoteResolverFetcher.js');

let cachedSchema = null;

// Local resolvers for the executable local schema. They resolve the local root fields and read the
// per-request dataloaders from the GraphQL execution context so that caching is shared across the
// local root fields of a single query.
const localResolvers = {
    Query: {
        products: (source, args, context) => {
            return new Products({
                search: args,
                graphqlContext: context,
                actionParameters: args,
                productsLoader: context.productsLoader,
                categoryTreeLoader: context.categoryTreeLoader
            });
        },
        category: (source, args, context) => {
            return new CategoryTree({
                categoryId: args.id,
                graphqlContext: context,
                actionParameters: args,
                categoryTreeLoader: context.categoryTreeLoader,
                productsLoader: context.productsLoader
            });
        },
        categoryList: (source, args, context) => {
            // returns an Array of categories
            let categoryId = args.filters.ids
                ? args.filters.ids.eq
                : args.filters.url_key
                ? args.filters.url_key.eq
                : 1;
            return [
                new CategoryTree({
                    categoryId: categoryId,
                    graphqlContext: context,
                    actionParameters: args,
                    categoryTreeLoader: context.categoryTreeLoader,
                    productsLoader: context.productsLoader
                })
            ];
        },
        customAttributeMetadata: () => {
            return null; // Not supported by example integration
        }
    }
};

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
                // The local schema is made executable by attaching resolvers that resolve the local
                // root fields ("products", "category", ...). The resolvers read the per-request
                // dataloaders from the GraphQL execution context (see below).
                let local = localSchema();
                let localOrder = local.sortOrder;
                let localExecutableSchema = addResolversToSchema({
                    schema: local,
                    resolvers: localResolvers
                });
                localExecutableSchema.sortOrder = localOrder;

                let subschemas = [localExecutableSchema];

                if (params.remoteSchemas) {
                    let cachedSchemas = [];

                    remotes.forEach((remote) => {
                        // When loaded from the aio-lib-state cache, the remote schema is an SDL
                        // string and must be rebuilt into a GraphQLSchema before being wrapped.
                        let remoteSchema =
                            typeof remote.schema === 'string' ? buildSchema(remote.schema) : remote.schema;

                        let remoteExecutableSchema = wrapSchema({
                            schema: remoteSchema,
                            executor: remote.executor
                        });
                        remoteExecutableSchema.sortOrder = remote.order;
                        subschemas.push(remoteExecutableSchema);

                        // We store the remote schemas in SDL form in the aio-lib-state cache
                        if (storeSchema) {
                            cachedSchemas.push({
                                schema: printSchema(remoteSchema),
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

                // Sort the subschemas by ascending sort order so that, on type conflicts,
                // the schema with the lowest sort order wins (see onTypeConflict).
                subschemas.sort((a, b) => a.sortOrder - b.sortOrder);

                let finalSchema = stitchSchemas({
                    subschemas: subschemas,
                    onTypeConflict: onTypeConflict
                });

                cachedSchema = finalSchema; // eslint-disable-line require-atomic-updates
            }

            // We instantiate some loaders common to the "products" and "category" resolvers.
            // They are passed to the local resolvers through the GraphQL execution context so that
            // caching/deduplication is shared across all the local root fields of a single query.
            let categoryTreeLoader = new CategoryTreeLoader(params);
            let productsLoader = new ProductsLoader(params);

            // Passed to all resolver actions, can for example contain an authentication token
            let context = {
                dummy: 'Can be some authentication token',
                productsLoader: productsLoader,
                categoryTreeLoader: categoryTreeLoader
            };

            // convert variables parameter to JSON object (requiered for GET requests)
            const variables = typeof (params.variables) === 'string' ? JSON.parse(params.variables) : params.variables;
            // Main resolver action, partially delegating resolution to the "remote schemas"
            return graphql(cachedSchema, params.query, {}, context, variables, params.operationName).then(
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
 * When stitching schemas, this method keeps the data of the schema with the lowest sort order.
 *
 * The subschemas passed to stitchSchemas are sorted by ascending sortOrder, and stitchSchemas
 * resolves type conflicts by reducing the type candidates in subschema order (left = earlier
 * candidate = lowest sortOrder). Keeping the "left" candidate therefore preserves the original
 * "lowest sortOrder wins" merge priority.
 */
function onTypeConflict(left) {
    return left;
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
        let executor = new RemoteResolverFetcher(resolver.action).executor;
        return introspectSchema(executor).then((schema) => {
            return Promise.resolve({
                schema,
                executor,
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
                executor: new RemoteResolverFetcher(obj.action).executor,
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
