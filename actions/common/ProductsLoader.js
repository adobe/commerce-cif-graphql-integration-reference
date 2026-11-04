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

// The default page size of the Magento GraphQL "products" field
const DEFAULT_PAGE_SIZE = 20;

// The default maximum page size, can be configured with the "max-page-size" input of the action
const DEFAULT_MAX_PAGE_SIZE = 100;

class ProductsLoader {
    /**
     * @param {Object} [actionParameters] Some optional parameters of the I/O Runtime action, like for example authentication info.
     */
    constructor(actionParameters) {
        let maxPageSize = actionParameters ? Number(actionParameters['max-page-size']) : NaN;
        this.maxPageSize = Number.isInteger(maxPageSize) && maxPageSize > 0 ? maxPageSize : DEFAULT_MAX_PAGE_SIZE;

        // A custom function to generate custom cache keys, simply serializing the key.
        let cacheKeyFunction = (key) => JSON.stringify(key, null, 0);

        // The loading function: the "key" is actually an object with search parameters
        let loadingFunction = (keys) => {
            return Promise.resolve(
                keys.map((key) => {
                    console.debug('--> Performing a search with ' + JSON.stringify(key, null, 0));
                    return this.__searchProducts(key, actionParameters).catch((error) => {
                        console.error(
                            `Failed loading products for search ${JSON.stringify(
                                key,
                                null,
                                0
                            )}, got error ${JSON.stringify(error, null, 0)}`
                        );
                        return null;
                    });
                })
            );
        };

        this.loader = new DataLoader((keys) => loadingFunction(keys), {
            cacheKeyFn: cacheKeyFunction
        });
    }

    load(key) {
        return this.loader.load(this.__boundPageSize(key));
    }

    /**
     * Never trust the page size requested by the client: an unbounded page size makes the backend
     * fetch and the action hold a large amount of data in memory for a single request.
     * The page size is clamped to the maximum page size, and invalid values fall back to the default page size.
     * The page_info.page_size field of the response reports the page size that was actually applied.
     *
     * @param {Object} key The search parameters.
     * @returns {Object} A copy of the search parameters with a bounded page size.
     */
    __boundPageSize(key) {
        if (!key || key.pageSize === undefined) {
            return key;
        }
        let pageSize = Number.isInteger(key.pageSize) && key.pageSize > 0 ? key.pageSize : DEFAULT_PAGE_SIZE;
        return { ...key, pageSize: Math.min(pageSize, this.maxPageSize) };
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
     * @param {number} [params.categoryId] An optional category id (integer), to get all the products if a given category.
     * @param {Integer} params.currentPage The "currentPage" argument of the GraphQL "products" field.
     * @param {Integer} params.pageSize The "pageSize" argument of the GraphQL "products" field.
     * @param {Object} actionParameters Some parameters of the I/O action itself (e.g. backend server URL, authentication info, etc)
     * @returns {Promise} A Promise with the products data.
     */
    __searchProducts(params, actionParameters) {
        // This method returns a Promise, for example to simulate some HTTP REST call being performed
        // to the 3rd-party commerce system.

        if (
            params.search ||
            params.categoryId ||
            (params.filter && (params.filter.category_id || params.filter.price))
        ) {
            // Text search or fetching of the products of a category
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
                        categoryIds: [1, 2]
                    },
                    {
                        sku: 'product-2',
                        title: 'Product #2',
                        description: `Fetched product #2 from ${actionParameters.url}`,
                        price: {
                            currency: 'USD',
                            amount: 56.78
                        },
                        categoryIds: [2, 3]
                    }
                ]
            });
        } else if (params.filter && (params.filter.sku || params.filter.url_key)) {
            // Get a product by sku or url_key
            if ((params.filter.sku && params.filter.sku.eq) || (params.filter.url_key && params.filter.url_key.eq)) {
                let key = params.filter.sku ? params.filter.sku.eq : params.filter.url_key.eq;
                return Promise.resolve({
                    total: 1,
                    offset: params.currentPage * params.pageSize,
                    limit: params.pageSize,
                    products: [
                        {
                            sku: key,
                            title: `Product #${key}`,
                            description: `Fetched product #${key} from ${actionParameters.url}`,
                            price: {
                                currency: 'USD',
                                amount: 12.34
                            },
                            categoryIds: [1, 2]
                        }
                    ]
                });
            } else if (params.filter.sku.in) {
                // Get multiple products by skus
                return Promise.resolve({
                    total: params.filter.sku.in.length,
                    offset: params.currentPage * params.pageSize,
                    limit: params.pageSize,
                    products: params.filter.sku.in.map((sku) => {
                        return {
                            sku: sku,
                            title: `Product #${sku}`,
                            description: `Fetched product #${sku} from ${actionParameters.url}`,
                            price: {
                                currency: 'USD',
                                amount: 12.34
                            },
                            categoryIds: [1, 2]
                        };
                    })
                });
            }
        }
    }
}

module.exports = ProductsLoader;
