/*
 * <license header>
 */

/**
 * This is a sample action showcasing how to access an external API
 *
 * Note:
 * You might want to disable authentication and authorization checks against Adobe Identity Management System for a generic action. In that case:
 *   - Remove the require-adobe-auth annotation for this action in the manifest.yml of your application
 *   - Remove the Authorization header from the array passed in checkMissingRequestInputs
 *   - The two steps above imply that every client knowing the URL to this deployed action will be able to invoke it without any authentication and authorization checks against Adobe Identity Management System
 *   - Make sure to validate these changes against your security requirements before deploying the action
 */

'use strict';

const fetch = require('node-fetch');
const { Core } = require('@adobe/aio-sdk');
const stateLib = require('@adobe/aio-lib-state');
const { errorResponse, getBearerToken, stringParameters, checkMissingRequestInputs } = require('../utils');

// main function that will be executed by Adobe I/O Runtime
async function main(params) {
    // create a Logger
    const logger = Core.Logger('main', { level: params.LOG_LEVEL || 'info' });
    const state = await stateLib.init();

    try {
        logger.debug(stringParameters(params));

        const requiredParams = ['product'];
        const errorMessage = checkMissingRequestInputs(params, requiredParams);
        if (errorMessage) {
            return errorResponse(400, errorMessage, logger);
        }

        const content = {};

        // get the product
        let val = await state.get(params.product);
        if (val != null) {
            logger.debug(JSON.stringify(val));
            content.product = JSON.parse(val.value);
        }

        // get the url_key index and find product
        val = await state.get('indexUrlKey');
        if (val != null) {
            content.url_key = val.value.find((x) => x.sku === params.product);
        }

        // get the text search index and find product
        val = await state.get('indexSearch');
        if (val != null) {
            content.search = val.value.find((x) => x.sku === params.product);
        }

        const response = {
            statusCode: 200,
            body: content
        };

        logger.info(`${response.statusCode}: successful request`);
        return response;
    } catch (error) {
        logger.error(error);
        return errorResponse(500, 'server error', logger);
    }
}

exports.main = main;
