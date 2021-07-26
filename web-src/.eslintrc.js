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

// We don't use a pattern here, so we can leverage eslint --fix.
const headerBlock = [
    '******************************************************************************',
    ' *',
    { 'pattern': ' *    Copyright 20\\d{2} Adobe. All rights reserved.', "template": " *    Copyright 2021 Adobe" },
    ' *    This file is licensed to you under the Apache License, Version 2.0 (the "License");',
    ' *    you may not use this file except in compliance with the License. You may obtain a copy',
    ' *    of the License at http://www.apache.org/licenses/LICENSE-2.0',
    ' *',
    ' *    Unless required by applicable law or agreed to in writing, software distributed under',
    ' *    the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS',
    ' *    OF ANY KIND, either express or implied. See the License for the specific language',
    ' *    governing permissions and limitations under the License.',
    ' *',
    ' *****************************************************************************'
];

module.exports = {
    root: true,
    settings: {
        react: {
            version: 'detect'
        }
    },
    env: {
        browser: true,
        node: true,
        es6: true
    },
    plugins: ['react', 'header'],
    parserOptions: {
        ecmaFeatures: {
            jsx: true
        },
        ecmaVersion: 2018,
        sourceType: 'module'
    },
    extends: ['eslint:recommended', 'plugin:react/recommended'],
    rules: {
        'no-console': 'off',
        'header/header': [2, 'block', headerBlock],
        'no-var': 'error',
        'one-var': ['error', 'never'],
        strict: ['error', 'global']
    }
};
