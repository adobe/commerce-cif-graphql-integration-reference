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
 * Derives the operation name from the first named OperationDefinition in the given document.
 * Returns null if the document has no named operation.
 */
function getOperationName(document) {
    if (document && Array.isArray(document.definitions)) {
        let operationDefinition = document.definitions.find(
            (definition) => definition.kind === 'OperationDefinition' && definition.name && definition.name.value
        );
        if (operationDefinition) {
            return operationDefinition.name.value;
        }
    }
    return null;
}

/**
 * This class implements a GraphQL Executor that can be used with the @graphql-tools/wrap
 * library (introspectSchema/wrapSchema) to query a remote GraphQL endpoint deployed in an
 * Adobe I/O Runtime action.
 */
class RemoteResolverFetcher {
    constructor(actionName) {
        this.actionName = actionName;

        // We export a method which MUST be bound to the object
        // because it's not going to be called with 'this.executor()'
        this.executor = this.__execute.bind(this);
    }

    __execute(params) {
        let query = print(params.document); // Convert from AST to String
        let context = params.context ? params.context.graphqlContext : null;
        let operationName = getOperationName(params.document);

        let ow = openwhisk();
        return ow.actions.invoke({
            actionName: this.actionName,
            blocking: true,
            result: true,
            params: {
                query,
                variables: params.variables,
                operationName,
                context
            }
        });
    }
}

module.exports = RemoteResolverFetcher;
