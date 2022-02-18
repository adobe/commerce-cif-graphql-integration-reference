#!/usr/bin/env node
/*******************************************************************************
 *
 *    Copyright 2022 Adobe. All rights reserved.
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

const { readFileSync, writeFileSync, readdirSync } = require('fs');
const { mergeSchemas } = require('graphql-tools');
const { introspectionFromSchema } = require('graphql');
const inquirer = require('inquirer');

const SchemaBuilder = require('../actions/common/SchemaBuilder');
const SchemaPruner = require('../actions/documentation/SchemaPruner');

const NOT_USED = 'NOT USED';

(async () => {
    console.log('This script will help you generate a minimal or pruned GraphQL schema based on the queries required for CIF.');

    // Find available schema and query versions
    let magentoVersions = findVersions('magento', /([\d]+\.[\d]+.[\d]+(ce|ee)?)/);
    let componentsVersions = findVersions('components', /([\d]+\.[\d]+.[\d]+(-SNAPSHOT)?)/);
    let addonVersions = findVersions('addon', /([\d]{4}\.[\d]{2}.[\d]{2}(\.[\d]+)?(-SNAPSHOT)?)/);

    // Ask user to provide version selection
    const answers = await inquirer
        .prompt([
            {
                type: 'list',
                name: 'magentoVersion',
                message: 'Please select the Adobe Commerce/Magento version, the schema should be based on:',
                choices: Array.from(magentoVersions),
            },
            {
                type: 'list',
                name: 'componentVersion',
                message: 'Please select a version of the CIF Core Components:',
                choices: [...Array.from(componentsVersions), NOT_USED]
            },
            {
                type: 'list',
                name: 'addonVersion',
                message: 'Please select a version of the CIF Add-on:',
                choices: [...Array.from(addonVersions), NOT_USED]
            },
        ]);

    const { magentoVersion, componentVersion, addonVersion } = answers;
    let schemas = [];

    // Read Magento schema
    const magentoSchema = JSON.parse(readFileSync(`magento/magento-schema-${magentoVersion}.json`, 'UTF-8'));

    // Generate pruned schema for add-on (backend)
    if (addonVersion !== NOT_USED) {
        const addonQueriesPath = `addon/addon-queries-${addonVersion}.log`;
        const addonSchema = generatePrunedSchema(magentoSchema, addonQueriesPath);
        schemas.push(addonSchema);
        writeFileSync(`cif-schema-addon-${addonVersion}.pruned.json`, JSON.stringify(addonSchema, null, 2), 'UTF-8');
        console.log(`Wrote add-on schema to cif-schema-addon-${addonVersion}.pruned.json`);
    }

    // Generate pruned schema for CIF Core Components
    if (componentVersion !== NOT_USED) {
        const componentQueriesPath = `components/components-queries-${componentVersion}.log`;
        const componentSchema = generatePrunedSchema(magentoSchema, componentQueriesPath);
        schemas.push(componentSchema);
        writeFileSync(`cif-schema-components-${componentVersion}.pruned.json`, JSON.stringify(componentSchema, null, 2), 'UTF-8');
        console.log(`Wrote components schema to cif-schema-components-${componentVersion}.pruned.json`);
    }

    // Select Add-on UI schema that matches Magento schema
    let addonUiSchema;
    try {
        addonUiSchema = JSON.parse(readFileSync(`addon-ui/cif-schema-addon-ui-${magentoVersion}.pruned.json`, 'UTF-8'));
        schemas.push(addonUiSchema);
    } catch (err) {
        console.error(`Could not find add-on UI schema for version ${magentoVersion}`, err);
        return;
    }

    // Merge Add-on UI, Components and Add-on schemas
    const executableSchemas = schemas.map(s => new SchemaBuilder(s).build());
    let mergedSchema = mergeSchemas({
        schemas: executableSchemas,
    });
    mergedSchema = mergePostActions(mergedSchema);

    // Using introspectionFromSchema will also validate the merged schema and fail if there are any errors
    console.log('Wrote final pruned schema to pruned-schema.json and pruned-schema.min.json');
    writeFileSync('pruned-schema.json', JSON.stringify({ data: introspectionFromSchema(mergedSchema) }, null, 2), 'UTF-8');
    writeFileSync('pruned-schema.min.json', JSON.stringify({ data: introspectionFromSchema(mergedSchema) }), 'UTF-8');

    // Also write pruned schema for introspection query
    writeFileSync('../actions/resources/pruned-schema.min.json', JSON.stringify({ data: introspectionFromSchema(mergedSchema) }), 'UTF-8');
})();

/**
 * Returns a pruned schema for a given Magento schema and the path to a query log file.
 */
function generatePrunedSchema(schema, queryPath) {
    let schemaPruner = new SchemaPruner(schema);
    pruneFile(schemaPruner, queryPath);
    return schemaPruner.prune();
}

/**
 * Parse query logs generated by unit tests and apply them to SchemaPruner instance.
 */
function pruneFile(schemaPruner, filepath) {
    let data;
    try {
        data = readFileSync(filepath, 'UTF-8');
    } catch (err) {
        console.error(`Could not read query file at ${filepath}`, err);
    }

    let lines = data.split(/\r?\n/);
    lines.forEach(line => {
        if (line.trim().length > 0) {
            schemaPruner.process(line);
        }
    });
}

/**
 * Fixes the schema after merge by adding all fields of ProductInterface to all subtypes (like BundleProduct).
 */
function mergePostActions(schema) {
    let productTypes = new Set();
    let productFields = new Set();

    // Find ProductInterface
    let productInferface = schema._typeMap['ProductInterface'];
    let productInterfaceImplementations = schema._implementations['ProductInterface'];
    if (!productInferface || !productInterfaceImplementations) {
        return schema;
    }

    // Collect product fields
    Object.keys(productInferface._fields).forEach(name => productFields.add(name));

    // Collect all product types
    productInterfaceImplementations.forEach(type => productTypes.add(type.name));

    // Extend all product types with fields of ProductInterface
    productTypes.forEach(type => {
        let productType = schema._typeMap[type];
        if (!productType) {
            return;
        }
        productFields.forEach(field => {
            if (field in productType._fields) {
                return;
            }
            // TODO: Deep copy needed?
            productType._fields[field] = productInferface._fields[field];
        });
    });

    return schema;
}

function findVersions(path, regex) {
    let versions = new Set();

    // List all files in directory
    let files = readdirSync(path);
    files.forEach(file => {
        let matches = regex.exec(file);
        if (matches.length > 1) {
            versions.add(matches[0]);
        }
    });

    return versions;
}