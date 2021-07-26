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

const openwhisk = require('openwhisk');
const { print } = require('graphql');

/**
 * This class implements a GraphQL Fetcher that can be used with the graphql-tools
 * library to query a remote GraphQL endpoint deployed in an Adobe I/O Runtime action.
 */
class RemoteResolverFetcher {
    constructor(actionName) {
        this.actionName = actionName;

        // We export a method which MUST be bound to the object
        // because it's not going to be called with 'this.fetcher()'
        this.fetcher = this.__fetch.bind(this);
    }

    __fetch(params) {
        let query = print(params.query); // Convert from AST to String
        let context = params.context ? params.context.graphqlContext : null;
        let ow = openwhisk();
        return ow.actions.invoke({
            actionName: this.actionName,
            blocking: true,
            result: true,
            params: {
                query,
                variables: params.variables,
                operationName: params.operationName,
                context
            }
        });
    }
}

module.exports = RemoteResolverFetcher;
