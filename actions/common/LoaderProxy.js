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

class LoaderProxy {
    /**
     * @param {*} clazz The class for which that proxy must be created.
     * The class must have a '__load' and '__convertData' function.
     */
    constructor(clazz) {
        /**
         * This class returns a Proxy to avoid having to implement a getter for all properties.
         */
        return new Proxy(clazz, {
            get(object, property) {
                if (Object.getOwnPropertyDescriptor(object, property)) {
                    return object[property]; // The object has that property
                }

                let prototype = Object.getPrototypeOf(object);
                if (Object.getOwnPropertyDescriptor(prototype, property)) {
                    return object[property]; // The object class has that property
                }

                return object
                    .__load()
                    .then((data) => {
                        if (!data) {
                            throw new Error('Backend data is null');
                        }

                        if (!object.data) {
                            object.data = data;
                            object.convertedData = object.__convertData(data);
                        }

                        return object.convertedData[property]; // Get the property from the converted data
                    })
                    .catch((error) => {
                        return error; // Will "bubble-up" the error to the GraphQL resolver which will add the error to the JSON response
                    });
            }
        });
    }
}

module.exports = LoaderProxy;
