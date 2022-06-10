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

const { readdirSync, readFileSync } = require('fs');
const { URL } = require('url');
const axios = require('axios');
const { getIntrospectionQuery, buildClientSchema, findBreakingChanges, parse, validate } = require('graphql');
const chalk = require('chalk');

const inquirer = require('inquirer');

(async () => {
    console.log('This script will validate the schema of your GraphQL endpoint and check compatibility with CIF.');

    const availableComponentVersions = await getAllComponentQueryVersions();

    const answers = await inquirer.prompt([
        {
            type: 'input',
            name: 'endpoint',
            message: 'Please provide the GraphQL endpoint URL:',
            default: 'https://adobe-starter.dummycachetest.com/graphql',
            validate: input => {
                try {
                    const parsed = new URL(input);
                    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
                        ? true
                        : 'Please provide a valid URL';
                } catch (err) {
                    return 'Please provide a valid URL';
                }
            }
        },
        {
            type: 'list',
            name: 'componentsVersion',
            message: 'Include queries of CIF Core Components?',
            choices: [...availableComponentVersions, 'Skip']
        },
        {
            type: 'confirm',
            name: 'includeAddon',
            message: 'Include queries of CIF Add-on?',
            default: true
        }
    ]);
    const { endpoint, componentsVersion, includeAddon } = answers;

    // Step 1, send introspection query to endpoint
    let response;
    try {
        response = await axios.post(endpoint, {
            query: getIntrospectionQuery()
        });
    } catch (err) {
        console.error('Error while requesting GraphQL schema:', err.code);
        return;
    }
    const schema = buildClientSchema(response.data.data);
    console.log('Downloaded and parsed GraphQL schema from your endpoint.');

    // Step 2, validate endpoint against queries from components
    if (componentsVersion !== 'Skip') {
        const componentQueries = await getComponentQueries(componentsVersion);
        const componentQueryErrors = validateQueries(schema, componentQueries);
        const compatible =
            componentQueryErrors.length > 0 ? chalk.bold.red('Not compatible') : chalk.bold.green('Compatible');
        console.log(`Checking compatibility with CIF Core Components ${componentsVersion}: ${compatible}`);
        componentQueryErrors.forEach(e => console.error(`-- ${chalk.blue(e)}`));
    }

    if (includeAddon) {
        // Step 3, validate endpoint against queries from addon
        const addonQueries = readFileSync('addon/addon-queries.log', 'UTF-8');
        const addonQueryErrors = validateQueries(schema, addonQueries);
        const compatible =
            addonQueryErrors.length > 0 ? chalk.bold.red('Not compatible') : chalk.bold.green('Compatible');
        console.log(`Checking compatibility with CIF Add-on (Backend): ${compatible}`);
        addonQueryErrors.forEach(e => console.error(`-- ${chalk.blue(e)}`));

        // Step 4, validate endpoint against schemas from add-on uo
        let addonUiVersions = getAddonUiVersions();
        console.log(`Checking compatibility with CIF Add-on (UI):`);
        let highestVersion;

        for (let version of addonUiVersions) {
            const frontendFile = JSON.parse(
                readFileSync(`addon-ui/cif-schema-addon-ui-${version}.pruned.json`, 'utf8')
            );
            const frontendSchema = buildClientSchema(frontendFile.data);
            const breakingChanges = findBreakingChanges(frontendSchema, schema);
            const compatible =
                breakingChanges.length > 0 ? chalk.bold.red('Not compatible') : chalk.bold.green('Compatible');
            console.log(`  - Version ${version}: ${compatible}`);
            if (breakingChanges.length === 0) {
                highestVersion = version;
            }
            breakingChanges.forEach(e => console.log(chalk.blue(`    -- ${e.type}: ${e.description}`)));
        }

        if (highestVersion) {
            console.log(chalk.yellow(`  CIF will use the highest compatible version, which is ${highestVersion}`));
        }
    }
})();

async function getAllComponentQueryVersions() {
    let response;
    try {
        response = await axios.get(
            'https://api.github.com/repos/adobe/commerce-cif-graphql-integration-reference/git/refs/tags'
        );
    } catch (err) {
        console.error('Error while downloading component query versions:', err.code);
        return new Set();
    }

    const regex = /([\d]+\.[\d]+.[\d]+)/;

    return new Set(
        response.data
            .filter(tag => tag.ref.startsWith('refs/tags/components-queries-'))
            .flatMap(tag => regex.exec(tag.ref))
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
            .reverse()
    );
}

async function getComponentQueries(version) {
    let response;
    try {
        response = await axios.get(
            `https://raw.githubusercontent.com/adobe/commerce-cif-graphql-integration-reference/components-queries-${version}/schemas/components/components-queries.log`
        );
    } catch (err) {
        console.error('Error while downloading component queries:', err.code);
        return '';
    }
    return response.data;
}

function validateQueries(schema, queryFileContent) {
    return queryFileContent
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .map(line => parse(line))
        .flatMap(query => validate(schema, query));
}

function getAddonUiVersions() {
    const versionSet = new Set();
    const regex = /([\d]+\.[\d]+.[\d]+(ce|ee)?)/;

    // List all files in directory
    let files = readdirSync('addon-ui');
    files.forEach(file => {
        let matches = regex.exec(file);
        if (matches.length > 1) {
            versionSet.add(matches[0]);
        }
    });

    return Array.from(versionSet).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}
