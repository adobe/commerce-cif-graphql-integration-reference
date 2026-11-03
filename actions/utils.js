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

const HIDDEN_VALUE = '<hidden>';

/**
 * Default name patterns of the parameters (and headers, and nested properties) whose values must never be logged.
 * Patterns are matched case-insensitively against the full property name, `*` matches any sequence of characters.
 * Note that `*key*` intentionally also matches non-secret names like `url_key`: a hidden value in a debug log is
 * better than a leaked API key.
 */
const DEFAULT_SENSITIVE_PARAM_PATTERNS = Object.freeze([
    '*secret*',
    '*token*',
    '*password*',
    '*passwd*',
    '*key*',
    '*credential*',
    '*authorization*',
    '*cookie*',
    'client_id',
    'client-id',
    'clientid'
]);

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toNameMatcher(pattern) {
    let regExp;
    if (pattern instanceof RegExp) {
        // Drop the stateful flags so that RegExp.test() always starts at index 0
        let flags = pattern.flags.replace(/[gy]/g, '');
        regExp = new RegExp(pattern.source, flags.includes('i') ? flags : flags + 'i');
    } else {
        regExp = new RegExp('^' + String(pattern).split('*').map(escapeRegExp).join('.*') + '$', 'i');
    }
    return (name) => regExp.test(name);
}

function redact(value, isSensitive, ancestors) {
    if (typeof value === 'string') {
        // GraphQL variables of GET requests (and similar inputs) are passed as JSON strings
        let trimmed = value.trim();
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
            try {
                return JSON.stringify(redact(JSON.parse(trimmed), isSensitive, ancestors));
            } catch (e) {
                return value;
            }
        }
        return value;
    }

    if (value === null || typeof value !== 'object') {
        return value;
    }

    if (ancestors.has(value)) {
        return '[Circular]';
    }
    ancestors.add(value);

    let result;
    if (Array.isArray(value)) {
        result = value.map((item) => redact(item, isSensitive, ancestors));
    } else {
        result = {};
        Object.keys(value).forEach((name) => {
            result[name] = isSensitive(name) ? HIDDEN_VALUE : redact(value[name], isSensitive, ancestors);
        });
    }

    ancestors.delete(value);
    return result;
}

/**
 *
 * Returns a log ready string of the action input parameters.
 * The values of all the parameters, headers, and nested properties whose name matches one of the sensitive
 * name patterns are replaced by '<hidden>'. The `params` object is not modified.
 *
 * @param {object} params action input parameters.
 * @param {Array<string|RegExp>} [sensitivePatterns] the name patterns of the values to hide,
 *        defaults to `DEFAULT_SENSITIVE_PARAM_PATTERNS`. String patterns support the `*` wildcard.
 *
 * @returns {string}
 *
 */
function stringParameters(params, sensitivePatterns = DEFAULT_SENSITIVE_PARAM_PATTERNS) {
    let matchers = sensitivePatterns.map(toNameMatcher);
    let isSensitive = (name) => matchers.some((matches) => matches(name));
    return JSON.stringify(redact(params, isSensitive, new Set()));
}

/**
 *
 * Returns the list of missing keys giving an object and its required keys.
 * A parameter is missing if its value is undefined or ''.
 * A value of 0 or null is not considered as missing.
 *
 * @param {object} obj object to check.
 * @param {array} required list of required keys.
 *        Each element can be multi level deep using a '.' separator e.g. 'myRequiredObj.myRequiredKey'
 *
 * @returns {array}
 * @private
 */
function getMissingKeys(obj, required) {
    return required.filter((r) => {
        const splits = r.split('.');
        const last = splits[splits.length - 1];
        const traverse = splits.slice(0, -1).reduce((tObj, split) => {
            tObj = tObj[split] || {};
            return tObj;
        }, obj);
        return traverse[last] === undefined || traverse[last] === ''; // missing default params are empty string
    });
}

/**
 *
 * Returns the list of missing keys giving an object and its required keys.
 * A parameter is missing if its value is undefined or ''.
 * A value of 0 or null is not considered as missing.
 *
 * @param {object} params action input parameters.
 * @param {array} requiredHeaders list of required input headers.
 * @param {array} requiredParams list of required input parameters.
 *        Each element can be multi level deep using a '.' separator e.g. 'myRequiredObj.myRequiredKey'.
 *
 * @returns {string} if the return value is not null, then it holds an error message describing the missing inputs.
 *
 */
function checkMissingRequestInputs(params, requiredParams = [], requiredHeaders = []) {
    let errorMessage = null;

    // input headers are always lowercase
    requiredHeaders = requiredHeaders.map((h) => h.toLowerCase());
    // check for missing headers
    const missingHeaders = getMissingKeys(params.__ow_headers || {}, requiredHeaders);
    if (missingHeaders.length > 0) {
        errorMessage = `missing header(s) '${missingHeaders}'`;
    }

    // check for missing parameters
    const missingParams = getMissingKeys(params, requiredParams);
    if (missingParams.length > 0) {
        if (errorMessage) {
            errorMessage += ' and ';
        } else {
            errorMessage = '';
        }
        errorMessage += `missing parameter(s) '${missingParams}'`;
    }

    return errorMessage;
}

/**
 *
 * Extracts the bearer token string from the Authorization header in the request parameters.
 *
 * @param {object} params action input parameters.
 *
 * @returns {string|undefined} the token string or undefined if not set in request headers.
 *
 */
function getBearerToken(params) {
    if (
        params.__ow_headers &&
        params.__ow_headers.authorization &&
        params.__ow_headers.authorization.startsWith('Bearer ')
    ) {
        return params.__ow_headers.authorization.substring('Bearer '.length);
    }
    return undefined;
}
/**
 *
 * Returns an error response object and attempts to log.info the status code and error message
 *
 * @param {number} statusCode the error status code.
 *        e.g. 400
 * @param {string} message the error message.
 *        e.g. 'missing xyz parameter'
 * @param {*} [logger] an optional logger instance object with an `info` method
 *        e.g. `new require('@adobe/aio-sdk').Core.Logger('name')`
 *
 * @returns {object} the error object, ready to be returned from the action main's function.
 *
 */
function errorResponse(statusCode, message, logger) {
    if (logger && typeof logger.info === 'function') {
        logger.info(`${statusCode}: ${message}`);
    }
    return {
        error: {
            statusCode,
            body: {
                error: message,
            },
        },
    };
}

module.exports = {
    DEFAULT_SENSITIVE_PARAM_PATTERNS,
    errorResponse,
    getBearerToken,
    stringParameters,
    checkMissingRequestInputs,
};
