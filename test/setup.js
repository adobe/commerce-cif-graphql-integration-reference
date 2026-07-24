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

// Mocha bootstrap (loaded via .mocharc.json "require").
// The modern @graphql-tools/* v6 packages reference `globalThis`, which only
// exists in Node 12+. This shim keeps `npm test` working on older local Node
// installs (Node 10). It is a no-op on Node 12+ and on CI (Node 12/18).
if (typeof globalThis === 'undefined') {
    global.globalThis = global;
}
