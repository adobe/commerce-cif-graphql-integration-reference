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

const { buildClientSchema, GraphQLSchema, GraphQLType } = require('graphql'); // eslint-disable-line no-unused-vars

class SchemaBuilder {

    /**
     * @param {*} jsonSchema The schema in JSON format, as returned by an introspection query.
     */
    constructor(jsonSchema) {
        // Copy the original (complete) Magento schema: needed because node.js "caches" modules
        this.schema = JSON.parse(JSON.stringify(jsonSchema, null, 0));
    }

    /**
     * Builds an executable schema.
     * 
     * @param Integer sortOrder An optional sort order that will be used when schemas are merged.
     * @returns {GraphQLSchema} A GraphQLSchema that can be used by all graphql-js tools.
     */
    build(sortOrder) {
        let queryRootType = this.schema.data.__schema.types.find(t => t.name == 'Query');
        let mutationRootType = this.schema.data.__schema.types.find(t => t.name == 'Mutation');

        // Remove "Query" root type if it doesn't have any field
        if (queryRootType && queryRootType.fields.length == 0) {
            delete this.schema.data.__schema.queryType;
            this.schema.data.__schema.types = this.schema.data.__schema.types.filter(t => t.name != 'Query');
        }

        // Remove "Mutation" root type if it doesn't have any field
        if (mutationRootType && mutationRootType.fields.length == 0) {
            delete this.schema.data.__schema.mutationType;
            this.schema.data.__schema.types = this.schema.data.__schema.types.filter(t => t.name != 'Mutation');
        }

        let clientSchema = buildClientSchema(this.schema.data);
        clientSchema.sortOrder = sortOrder || 1000;
        return clientSchema;
    }

    /**
     * Removes the Mutation type (and its fields) from the schema.
     * 
     * @returns The builder itself.
     */
    removeMutationType() {
        this.schema.data.__schema.types = this.schema.data.__schema.types.filter(t => t.name != 'Mutation');
        delete this.schema.data.__schema.mutationType;
        return this;
    }

    /**
     * Removes the Query type (and its fields) from the schema.
     * 
     * @returns The builder itself.
     */
    removeQueryType() {
        this.schema.data.__schema.types = this.schema.data.__schema.types.filter(t => t.name != 'Query');
        delete this.schema.data.__schema.queryType;
        return this;
    }

    /**
     * Filters the top-level fields of the Query root type based on the given set of strings.
     * 
     * @param {Set<String>} queryFields A set of the top-level field names that should be kept in the Query root type.
     * @returns The builder itself.
     */
    filterQueryFields(queryFields) {
        let queryRootType = this.schema.data.__schema.types.find(t => t.name == 'Query');
        queryRootType.fields = queryRootType.fields.filter(f => queryFields.has(f.name));
        return this;
    }

    /**
     * Filters the top-level fields of the Mutation root type based on the given set of strings.
     * 
     * @param {Set<String>} mutationFields A set of the top-level field names that should be kept in the Mutation root type.
     * @returns The builder itself.
     */
    filterMutationFields(mutationFields) {
        let mutationRootType = this.schema.data.__schema.types.find(t => t.name == 'Mutation');
        mutationRootType.fields = mutationRootType.fields.filter(f => mutationFields.has(f.name));
        return this;
    }

    /**
     * Returns the GraphQLType object with the given type name.
     * 
     * @param {String} typeName The type name that should be returned.
     * 
     * @returns {GraphQLType} The GraphQL type object.
     */
    getType(typeName) {
        return this.schema.data.__schema.types.find(t => t.name == typeName);
    }
}

module.exports = SchemaBuilder;