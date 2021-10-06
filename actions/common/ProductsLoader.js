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
const { Core } = require('@adobe/aio-sdk');
const { async } = require('regenerator-runtime');
class ProductsLoader {
    /**
     * @param {Object} [actionParameters] Some optional parameters of the I/O Runtime action, like for example authentication info.
     */
    constructor(actionParameters) {
        this.logger = Core.Logger('ProductsLoader', { level: actionParameters.LOG_LEVEL || 'info' });

        // A custom function to generate custom cache keys, simply serializing the key.
        let cacheKeyFunction = (key) => JSON.stringify(key, null, 0);

        // The loading function: the "key" is actually an object with search parameters
        let loadingFunction = (keys) => {
            return Promise.resolve(
                keys.map((key) => {
                    this.logger.debug('Performing a search with ' + JSON.stringify(key, null, 0));
                    return this.__searchProducts(key, actionParameters).catch((error) => {
                        this.logger.error(
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
     * @param {number} [params.categoryId] An optional category id (integer), to get all the products if a given category.
     * @param {Integer} params.currentPage The "currentPage" argument of the GraphQL "products" field.
     * @param {Integer} params.pageSize The "pageSize" argument of the GraphQL "products" field.
     * @param {Object} actionParameters Some parameters of the I/O action itself (e.g. backend server URL, authentication info, etc)
     * @returns {Promise} A Promise with the products data.
     */
    async __searchProducts(params, actionParameters) {
        // This method returns a Promise, for example to simulate some HTTP REST call being performed
        // to the 3rd-party commerce system.
        const state = actionParameters.state;
        if (
            params.search ||
            (params.filter &&
                (params.filter.name || params.filter.sku || params.filter.url_key || params.filter.category_uid))
        ) {
            const productSkusFunction = async (params) => {
                // query products by text search
                if (params.search || (params.filter.name && params.filter.name.match)) {
                    const query = params.search !== undefined ? params.search : params.filter.name.match;
                    this.logger.debug(`search products for term ${query}`);

                    const val = await state.get('indexSearch');
                    if (val != null) {
                        return val.value
                            .filter((x) => x.name.toLowerCase().includes(query.toLowerCase()))
                            .map((x) => x.sku);
                    }
                }

                // get one ore multiple products by url_key
                if (params.filter.url_key && (params.filter.url_key.eq || params.filter.url_key.in)) {
                    const productUrlKeys =
                        params.filter.url_key.in !== undefined ? params.filter.url_key.in : [params.filter.url_key.eq];
                    this.logger.debug(`search products for url keys ${productUrlKeys}`);
                    const val = await state.get('indexUrlKey');
                    if (val != null) {
                        return productUrlKeys
                            .map((urlKey) => {
                                return val.value.find((x) => x.url_key === urlKey);
                            })
                            .filter((x) => x)
                            .map((x) => x.sku);
                    }
                }

                // get one ore multiple products by category
                if (params.filter.category_uid && (params.filter.category_uid.eq || params.filter.category_uid.in)) {
                    const categoryUIDs =
                        params.filter.category_uid.in !== undefined
                            ? params.filter.category_uid.in
                            : [params.filter.category_uid.eq];
                    categoryUIDs.map((cat) => 'c-' + cat);
                    this.logger.debug(`search products for categories ${categoryUIDs}`);

                    return await categoryUIDs.map(async(categoryUID) => {
                        const val = await state.get(categoryUID);
                        if (val != null) {
                            this.logger.debug(`1 found category ${JSON.stringify(val.value)}`);
                            if (val.value.products) {
                                this.logger.debug(`2 found category ${JSON.stringify(val.value)}`);
                                return val.value.products;
                            }
                            return [];
                        }
                    });
                }
                return [];
            };

            let productSkus = [];
            // for SKU query no extra index lookup is needed, can be returned directly
            if (params.filter && params.filter.sku && (params.filter.sku.eq || params.filter.sku.in)) {
                productSkus =
                    params.filter.sku.in !== undefined
                        ? params.filter.sku.in.map((x) => 'p-' + x.trim())
                        : ['p-' + params.filter.sku.eq.trim()];
            } else {
                productSkus = await productSkusFunction(params);
            }

            const promises = productSkus.map(async (sku) => {
                const val = await state.get(sku);
                if (val != null) {
                    this.logger.debug(`Product with sku ${sku} loaded`);
                    return JSON.parse(val.value);
                } else {
                    this.logger.debug(`Product with sku ${sku} not found`);
                }
            });

            return Promise.all(promises).then((products) => ({
                products: products,
                total: products.length,
                offset: params.currentPage * params.pageSize,
                limit: params.pageSize
            }));
        }
    }
}

module.exports = ProductsLoader;
