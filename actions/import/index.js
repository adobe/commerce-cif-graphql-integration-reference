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

const fetch = require('node-fetch');
const { Core } = require('@adobe/aio-sdk');
const stateLib = require('@adobe/aio-lib-state');
const { errorResponse, stringParameters, checkMissingRequestInputs } = require('../utils');
const Papa = require('papaparse');

const data_ttl = 604800; // store for 7 days

// https://stackoverflow.com/questions/7616461/generate-a-hash-from-string-in-javascript/22429679
String.prototype.hashCode = function () {
    var hash = 0,
        i,
        chr;
    if (this.length === 0) return hash;
    for (i = 0; i < this.length; i++) {
        chr = this.charCodeAt(i);
        hash = (hash << 5) - hash + chr;
        hash |= 0; // Convert to 32bit integer
    }
    return hash;
};

function extractCategories(product, categoryList) {
    const mappedCategories = categoryList;
    const productCategories = [];
    if (product.categories != null) {
        const categories = product.categories.split(',');
        categories.forEach((category) => {
            const categoryParts = category.split('/').map((x) => {
                return { uid: 'c-' + x.hashCode(), name: x };
            });
            categoryParts.forEach(function (categoryPart, i) {
                if (i < categoryParts.length - 1) {
                    // store the child relationship if catagory has children
                    const categoryIndex = mappedCategories.findIndex((obj) => obj.uid == categoryPart.uid);
                    const childCatUid = categoryParts[i + 1].uid;
                    if (categoryIndex > -1) {
                        const mappedCategory = mappedCategories[categoryIndex];
                        if ('children' in mappedCategory) {
                            if (mappedCategory.children.indexOf(childCatUid) === -1) {
                                mappedCategory.children.push(childCatUid);
                            }
                        } else {
                            mappedCategory.children = [childCatUid];
                        }
                        mappedCategories[categoryIndex] = mappedCategory;
                    } else {
                        categoryPart.children = [childCatUid];
                        mappedCategories.push(categoryPart);
                    }
                } else {
                    // if category is leaf assign to product
                    const categoryIndex = mappedCategories.findIndex((obj) => obj.uid == categoryPart.uid);
                    if (categoryIndex === -1) {
                        categoryPart.products = ['p-' + product.sku];
                        mappedCategories.push(categoryPart);
                    } else {
                        const mappedCategory = mappedCategories[categoryIndex];
                        if ('products' in mappedCategory) {
                            if (mappedCategory.products.indexOf(product.sku) === -1) {
                                mappedCategory.products.push('p-' + product.sku);
                            }
                        } else {
                            mappedCategory.products = [childCatUid];
                        }
                        mappedCategories[categoryIndex] = mappedCategory;
                    }
                    productCategories.push(categoryPart.uid);
                }
            });
        });
    }
    return { categoryIndex: mappedCategories, productCategories: productCategories };
}

async function main(params) {
    const logger = Core.Logger('main', { level: params.LOG_LEVEL || 'info' });
    const state = await stateLib.init();

    try {
        logger.info('Calling the main action');
        logger.debug(stringParameters(params));

        const requiredParams = ['file'];
        const errorMessage = checkMissingRequestInputs(params, requiredParams);
        if (errorMessage) {
            return errorResponse(400, errorMessage, logger);
        }

        const processedProducts = [];
        let processedCategories = [];
        await fetch(params.file)
            .then((resp) => resp.text())
            .then((result) => {
                return Papa.parse(result, {
                    delimiter: ';',
                    header: true,
                    skipEmptyLines: true,
                    error: function (err, file) {
                        logger.error(`CSV parsing error: ${err}`);
                    },
                    complete: function (results) {
                        logger.debug('Parsing complete');
                    },
                    step: function (results, parser) {
                        const product = results.data;
                        if (product != null) {
                            const key = 'p-' + product.sku;
                            logger.debug(`Procces : ${key}: ${product.name}, ${product.categories}`);
                            let { categoryIndex, productCategories } = extractCategories(product, processedCategories);
                            processedCategories = categoryIndex;
                            product.categories = productCategories; // replace categories from CSV with mapped categories
                            state.put(key, JSON.stringify(product), { ttl: data_ttl });
                            processedProducts.push({
                                sku: key,
                                name: product.name,
                                url_key: product.url_key,
                                categories: product.categories
                            });
                        }
                    }
                }).data;
            });

        if (processedProducts.length > 0) {
            logger.debug('store url_key index');
            await state.put(
                'indexUrlKey',
                processedProducts.map((entry) => {
                    const { name, categories, ...other } = entry;
                    return { ...other };
                }),
                { ttl: data_ttl }
            );

            logger.debug('store search index');
            await state.put(
                'indexSearch',
                processedProducts.map((entry) => {
                    const { url_key, categories, ...other } = entry;
                    return { ...other };
                }),
                { ttl: data_ttl }
            );

            logger.debug('store category index');
            await state.put(
                'indexCategory',
                processedProducts.map((entry) => {
                    const { name, url_key, ...other } = entry;
                    return { ...other };
                }),
                { ttl: data_ttl }
            );
        }

        if (processedCategories.length > 0) {
            logger.debug('store categories');
            processedCategories.forEach(async (category) => {
                await state.put(category.uid, category, { ttl: data_ttl });
            });
        }

        const content = { storedProducts: processedProducts.length };
        const response = {
            statusCode: 200,
            body: content
        };
        logger.info(stringParameters(response));
        return response;
    } catch (error) {
        logger.error(error);
        return errorResponse(500, 'server error', logger);
    }
}

exports.main = main;
