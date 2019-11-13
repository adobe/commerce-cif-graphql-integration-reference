/*******************************************************************************
 *
 *    Copyright 2019 Adobe. All rights reserved.
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

const magentoSchema = require('../resources/magento-schema-2.3.2.min.json');
const { makeRemoteExecutableSchema, introspectSchema, mergeSchemas } = require('graphql-tools');
const { graphql } = require('graphql');

const { Products, CategoryTree } = require('../common/Catalog.js');
const ProductsLoader = require('../common/ProductsLoader.js');
const CategoryTreeLoader = require('../common/CategoryTreeLoader.js');
const SchemaBuilder = require('../common/SchemaBuilder.js');
const RemoteResolverFetcher = require('../common/RemoteResolverFetcher.js');

let cachedSchema = null;

function resolve(args) {

    let remoteResolvers = [];
    if (cachedSchema == null && args.remoteSchemas) {
        // Get all resolver actions to fetch the remote schemas dynamically
        remoteResolvers = Object.values(args.remoteSchemas).map(resolver => {
            let fetcher = new RemoteResolverFetcher(resolver.action).fetcher;
            return introspectSchema(fetcher).then(schema => {
                return Promise.resolve({
                    schema,
                    fetcher,
                    order: resolver.order
                });
            });
        });
    } else {
        remoteResolvers.push(Promise.resolve({})); // Do nothing below
    }

    return Promise.all(remoteResolvers).then(remotes => {

        if (cachedSchema == null) {
            let remoteExecutableSchemas = [localSchema()];

            if (args.remoteSchemas) {
                remotes.forEach(remote => {
                    let remoteExecutableSchema = makeRemoteExecutableSchema({
                        schema: remote.schema,
                        fetcher: remote.fetcher
                    });
                    remoteExecutableSchema.sortOrder = remote.order;
                    remoteExecutableSchemas.push(remoteExecutableSchema);
                });
            }

            // Keep schema types with lowest order
            let onTypeConflict = (left, right, info) => {
                let diff = info.left.schema.sortOrder - info.right.schema.sortOrder;
                return (diff <= 0) ? left : right;
            };

            let finalSchema = mergeSchemas({
                schemas: remoteExecutableSchemas,
                onTypeConflict: onTypeConflict
            });

            cachedSchema = finalSchema;
        }

        // Passed to all resolver actions, can for example contain an authentication token
        let context = {
            dummy: "Can be some authentication token"
        };

        // We instantiate some loaders common to the "products" and "category" resolvers
        let categoryTreeLoader = new CategoryTreeLoader(args);
        let productsLoader = new ProductsLoader(args);

        // Local resolvers object
        let resolvers = {
            products: (params, context) => {
                return new Products({
                    search: params,
                    graphqlContext: context,
                    actionParameters: args,
                    productsLoader: productsLoader,
                    categoryTreeLoader: categoryTreeLoader
                });
            },
            category: (params, context) => {
                return new CategoryTree({
                    categoryId: params.id,
                    graphqlContext: context,
                    actionParameters: args,
                    categoryTreeLoader: categoryTreeLoader,
                    productsLoader: productsLoader
                });
            }
        }; 

        // Main resolver action, partially delegating resolution to the "remote schemas"
        return graphql(cachedSchema, args.query, resolvers, context, args.variables, args.operationName).then((response) => {
            return {
                body: response
            }
        });
    }).catch(error => {
        console.error(error);
    });
}

/**
 * This method processes the default Magento schema and returns the modified schema.
 * It demonstrates how it is possible to modify the Magento schema, for example to remove
 * all unimplemented fields, customize GraphQL types, and add new types and fields to the 
 * magento schema.
 */
function localSchema() {

    // The local schema only implements the "products" and "category" fields of the Query root type
    let schemaBuilder = new SchemaBuilder(magentoSchema)
        .removeMutationType()
        .filterQueryFields(new Set(["products", "category"]));

    let queryRootType = schemaBuilder.getType('Query');

    // Remove "sort" unimplemented args of the "products" field
    let productsField = queryRootType.fields.find(f => f.name == 'products');
    productsField.args = productsField.args.filter(a => a.name != 'sort');
    // Remove all fields from ProductFilterInput except "sku"
    let productFilterInput = schemaBuilder.getType('ProductFilterInput');
    productFilterInput.inputFields = productFilterInput.inputFields.filter(f => f.name == 'sku');

    let categoryField = queryRootType.fields.find(f => f.name == 'category');
    // Change category(id: Int) to category(id: String)
    categoryField.args[0].type.name = 'String';
    // Change CategoryInterface.id from Int to String
    let categoryInterfaceType = schemaBuilder.getType('CategoryInterface');
    categoryInterfaceType.fields.find(f => f.name == 'id').type.name = 'String';
    // Change CategoryTree.id from Int to String
    let categoryTreeType = schemaBuilder.getType('CategoryTree');
    categoryTreeType.fields.find(f => f.name == 'id').type.name = 'String';

    // Add a new type and field under the Query root type
    // Note that when adding a field to an interface, you must also add it to all its implementation types
    // --> see the other examples below for a better method to add fields to interfaces
    schemaBuilder.extend(`
        extend type Query {
            # Fetches a wishlist by id
            wishlist(id: String!): Wishlist
        }

        type Wishlist {
            # The wishlist id
            id: String
            # The products in the wishlist
            products: [ProductInterface]
        }
    `);

    // Add some fields to the ProductInterface type and all its implementations
    schemaBuilder.addFieldToType('ProductInterface', 'rating', 'The rating of the product', 'String');
    schemaBuilder.addFieldToType('ProductInterface', 'accessories', 'The accessories of the product', 'ProductInterface', true);
    schemaBuilder.addFieldToType('ProductInterface', 'country_of_origin', 'The code of the country where the product is manufactured', 'CountryCodeEnum');

    return schemaBuilder.build(10);
}

module.exports.main = resolve;