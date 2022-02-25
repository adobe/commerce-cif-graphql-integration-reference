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

const { google } = require('googleapis');
const sheets = google.sheets('v4');

async function getAuthToken() {
    const auth = new google.auth.GoogleAuth({
        keyFile: 'keys.json',
        scopes: 'https://www.googleapis.com/auth/spreadsheets'
    });

    const authToken = await auth.getClient();
    return authToken;
}

async function getSpreadSheetValues({ spreadsheetId, auth, spreadsheetRange }) {
    const res = await sheets.spreadsheets.values.get({
        spreadsheetId,
        auth,
        range: spreadsheetRange
    });
    return res;
}

module.exports = {
    getAuthToken,
    getSpreadSheetValues
};
