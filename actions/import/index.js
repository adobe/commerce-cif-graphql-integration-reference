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

        const storedProducts = [];
        await fetch(params.file)
            .then((resp) => resp.text())
            .then((result) => {
                return Papa.parse(result, {
                    delimiter: ';',
                    header: true,
                    error: function (err, file) {
                        logger.error('CSV parsing error: {}', err);
                    },
                    complete: function (results) {
                        logger.debug('Parsing complete');
                    },
                    step: function (results, parser) {
                        const product = results.data;
                        if (product != null) {
                            const key = 'p-' + product.sku;
                            //logger.debug('Procces : ' + key);
                            state.put(key, JSON.stringify(product), { ttl: -1 });
                            storedProducts.push({ sku: key, name: product.name, url_key: product.url_key });
                        }
                    }
                }).data;
            });

        if (storedProducts.length > 0) {
            logger.debug('store url_key index');
            await state.put(
                'indexUrlKey',
                storedProducts.map(
                    (entry) => {
                        const { name, ...other } = entry;
                        return { ...other };
                    },
                    { ttl: -1 }
                )
            );

            logger.debug('store search index');
            await state.put(
                'indexSearch',
                storedProducts.map(
                    (entry) => {
                        const { url_key, ...other } = entry;
                        return { ...other };
                    },
                    { ttl: -1 }
                )
            );
        }

        const content = { storedProducts: storedProducts.length };
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
