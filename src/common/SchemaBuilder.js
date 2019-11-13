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

const { buildClientSchema, GraphQLSchema, GraphQLType, parse, extendSchema, introspectionQuery, graphqlSync } = require('graphql'); // eslint-disable-line no-unused-vars

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

    /**
     * @private
     */
    __toFieldType(fieldType, isList = false) {
        if (isList) {
            return 'LIST';
        } else if (['String', 'Int', 'Float', 'Boolean', 'ID'].includes(fieldType)) {
            return 'SCALAR';
        } else {
            let t = this.getType(fieldType);
            return t ? t.kind : null;
        }
    }

    /**
     * @private
     */
    __toTypeDef(fieldType, isList = false) {
        return {
            kind: this.__toFieldType(fieldType, isList),
            name: isList ? null : fieldType,
            ofType: isList ? this.__toTypeDef(fieldType) : null
        }
    }

    /**
     * Adds a new field to an existing type. If the type is an interface, this method also adds the new field to all
     * the types implementing this interface.
     * 
     * @param {String} typeName The type name, for example, 'ProductInterface'
     * @param {String} name The name of the new field.
     * @param {String} description The description for the new field.
     * @param {String} fieldTypeName The type name of the new field, for example, 'String', 'Int', or 'CategoryTree'
     * @param {Boolean} [isList] Set to true if the new field is an Array. In this case, fieldTypeName specifies the type of the elements of the array. 
     */
    addFieldToType(typeName, name, description, fieldTypeName, isList = false) {
        let type = this.getType(typeName);
        let newField = {
            name: name,
            description: description,
            args: [],
            type: this.__toTypeDef(fieldTypeName, isList),
            isDeprecated: false,
            deprecationReason: null
        };
        type.fields.push(newField);
        type.fields.sort((a,b) => a.name.localeCompare(b.name));

        if (type.kind == 'INTERFACE' && type.possibleTypes) {
            type.possibleTypes.forEach(possibleType => {
                let t = this.getType(possibleType.name);
                t.fields.push(newField);
                t.fields.sort((a,b) => a.name.localeCompare(b.name));
            });
        }
    }

    /**
     * Extends the schema with the given SDL. This method modifies the schema currently being processed.
     * 
     * @param {String} sdl The SDL describing the schema extension(s).
     */
    extend(sdl) {
        let ast = parse(sdl);
        let graphQLSchema = buildClientSchema(this.schema.data);
        let extendedGraphQLSchema = extendSchema(graphQLSchema, ast, {commentDescriptions: true});
        this.schema = graphqlSync(extendedGraphQLSchema, introspectionQuery);
    }
}

module.exports = SchemaBuilder;