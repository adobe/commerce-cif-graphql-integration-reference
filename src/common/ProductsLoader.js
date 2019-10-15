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

const DataLoader = require('dataloader');

class ProductsLoader {

    /**
     * @param {Object} [actionParameters] Some optional parameters of the I/O Runtime action, like for example authentication info.
     */
    constructor(actionParameters) {
        // A custom function to generate custom cache keys, simply serializing the key.
        let cacheKeyFunction = key => JSON.stringify(key, null, 0);

        // The loading function: the "key" is actually an object with search parameters
        let loadingFunction = keys => {
            return Promise.resolve(keys.map(key => {
                console.debug('--> Performing a search with ' + JSON.stringify(key, null, 0));
                return this.__searchProducts(key, actionParameters)
                    .catch(error => {
                        console.error(`Failed loading products for search ${JSON.stringify(key, null, 0)}, got error ${JSON.stringify(error, null, 0)}`);
                        return null;
                    });
            }));
        };

        this.loader = new DataLoader(keys => loadingFunction(keys), {cacheKeyFn: cacheKeyFunction});
    }

    load(key) {
        return this.loader.load(key);
    }

    /**
     * In a real 3rd-party integration, this method would query the 3rd-party system to search 
     * products based on the search parameters. Note that to demonstrate how one can customize the arguments
     * of a field, the "sort" argument of the "products" field has been removed from the schema
     * in the main dispatcher action.
     *  
     * @param {Object} params An object with the search parameters defined by the Magento GraphQL "products" field.
     * @param {String} [params.search] The "search" argument of the GraphQL "products" field.
     * @param {String} [params.filter] The "filter" argument of the GraphQL "products" field.
     * @param {String} [params.categoryId] An optional category id, to get all the products if a given category.
     * @param {Integer} params.currentPage The "currentPage" argument of the GraphQL "products" field.
     * @param {Integer} params.pageSize The "pageSize" argument of the GraphQL "products" field.
     * @param {Object} actionParameters Some parameters of the I/O action itself (e.g. backend server URL, authentication info, etc)
     * @returns {Promise} A Promise with the products data.
     */
    __searchProducts(params, actionParameters) {

        // This method returns a Promise, for example to simulate some HTTP REST call being performed
        // to the 3rd-party commerce system.

        if (params.search || params.categoryId) { // Text search or fetching of the products of a category
            return Promise.resolve({
                total: 2,
                offset: params.currentPage * params.pageSize,
                limit: params.pageSize,
                products: [
                    {
                        sku: 'product-1',
                        title: 'Product #1',
                        description: `Fetched product #1 from ${actionParameters.url}`,
                        price: {
                            currency: 'USD',
                            amount: 12.34
                        },
                        categoryIds: [ 'cat1', 'cat2']
                    },
                    {
                        sku: 'product-2',
                        title: 'Product #2',
                        description: `Fetched product #2 from ${actionParameters.url}`,
                        price: {
                            currency: 'USD',
                            amount: 56.78
                        },
                        categoryIds: [ 'cat2', 'cat3']
                    }
                ]
            });
        } else if (params.filter && params.filter.sku) { // Get a product by sku
            if (params.filter.sku.eq) {
                return Promise.resolve({
                    total: 1,
                    offset: params.currentPage * params.pageSize,
                    limit: params.pageSize,
                    products: [
                        {
                            sku: params.filter.sku.eq,
                            title: `Product #${params.filter.sku.eq}`,
                            description: `Fetched product #${params.filter.sku.eq} from ${actionParameters.url}`,
                            price: {
                                currency: 'USD',
                                amount: 12.34
                            },
                            categoryIds: [ 'cat1', 'cat2']
                        }
                    ]
                });
            } else if (params.filter.sku.in) { // Get multiple products by skus
                return Promise.resolve({
                    total: params.filter.sku.in.length,
                    offset: params.currentPage * params.pageSize,
                    limit: params.pageSize,
                    products: params.filter.sku.in.map(sku => {
                        return {
                            sku: sku,
                            title: `Product #${sku}`,
                            description: `Fetched product #${sku} from ${actionParameters.url}`,
                            price: {
                                currency: 'USD',
                                amount: 12.34
                            },
                            categoryIds: [ 'cat1', 'cat2']
                        }
                    })
                });
            }
        }
    }
}

module.exports.ProductsLoader = ProductsLoader;