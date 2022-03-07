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
const {
    getAuthToken,
    getSpreadSheetValues
} = require('../services/googleSheet.js');

class ProductsLoader {
    /**
     * @param {Object} [actionParameters] Some optional parameters of the I/O Runtime action, like for example authentication info.
     */
    constructor(actionParameters) {
        // A custom function to generate custom cache keys, simply serializing the key.
        let cacheKeyFunction = (key) => JSON.stringify(key, null, 0);

        // The loading function: the "key" is actually an object with search parameters
        let loadingFunction = (keys) => {
            return Promise.resolve(
                keys.map((key) => {
                    console.debug(
                        '--> Performing a search with ' +
                            JSON.stringify(key, null, 0)
                    );
                    return this.__searchProducts(key, actionParameters).catch(
                        (error) => {
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
        return this.loader.load(key);
    }

    __mapProductRow(product) {
        return {
            sku: product[0],
            title: product[1],
            description: product[8],
            short_description: product[9],
            price: {
                currency: 'USD',
                amount: product[3]
            },
            image_url: product[4],
            categoryIds: [product[5]]
        };
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
     * @param {Object} actionParameters Some parameters of the I/O action itself (e.g. backend server URL, authentication info, etc)
     * @returns {Promise} A Promise with the products data.
     */
    async __searchProducts(params, actionParameters) {
        //Read from the spreadsheet
        const spreadsheetId = actionParameters.SPREADSHEET;
        const spreadsheetRange = 'weretail-internal!C2:L';
        const auth = await getAuthToken();
        const response = await getSpreadSheetValues({
            spreadsheetId,
            auth,
            spreadsheetRange
        });

        if (params.search) {
            const product = response.data.values.filter((row) =>
                row[1].includes(params.search)
            );
            return Promise.resolve({
                total: product.length,
                offset: params.currentPage * params.pageSize,
                limit: params.pageSize,
                products: product.map((product) => {
                    return this.__mapProductRow(product);
                })
            });
        } else if (params.filter) {
            if (params.filter.sku || params.filter.url_key) {
                let keys = params.filter.sku
                    ? params.filter.sku.eq
                        ? [params.filter.sku.eq]
                        : params.filter.sku.in
                    : params.filter.url_key.eq
                    ? [params.filter.url_key.eq]
                    : params.filter.url_key.in;

                const product = response.data.values.filter((row) =>
                    keys.includes(row[0])
                );

                return Promise.resolve({
                    total: product.length,
                    offset: params.currentPage * params.pageSize,
                    limit: params.pageSize,
                    products: product.map((product) => {
                        return this.__mapProductRow(product);
                    })
                });
            }
            if (params.filter.category_uid) {
                let keys = params.filter.category_uid.eq
                    ? [params.filter.category_uid.eq]
                    : params.filter.category_uid.in;

                const product = response.data.values.filter((row) =>
                    keys.includes(row[5])
                );

                return Promise.resolve({
                    total: product.length,
                    offset: params.currentPage * params.pageSize,
                    limit: params.pageSize,
                    products: product.map((product) => {
                        return this.__mapProductRow(product);
                    })
                });
            }
        }
    }
}

module.exports = ProductsLoader;
