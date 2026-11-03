/*******************************************************************************
 *
 *    Copyright 2021 Adobe. All rights reserved.
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

"use strict";

const sinon = require("sinon");
const expect = require("chai").expect;

const utils = require("../../actions/utils");

describe("utils.js", () => {
    let logger = sinon.spy();

    describe("errorResponse", () => {
        it("(400, errorMessage, logger)", () => {
            const res = utils.errorResponse(400, "errorMessage", logger);
            expect(res).to.deep.equal({
                error: {
                    statusCode: 400,
                    body: { error: "errorMessage" },
                },
            });
        });
    });

    describe("stringParameters", () => {
        it("no sensitive parameters", () => {
            const params = {
                a: 1,
                b: 2,
                url: "https://mybackendserver.com/rest",
                __ow_headers: { "x-request-id": "abcd" },
            };
            expect(utils.stringParameters(params)).to.equal(
                JSON.stringify(params)
            );
        });
        it("with auth header", () => {
            const params = {
                a: 1,
                b: 2,
                __ow_headers: {
                    "x-api-key": "fake-api-key",
                    authorization: "secret",
                },
            };
            expect(utils.stringParameters(params)).to.include(
                '"authorization":"<hidden>"'
            );
            expect(utils.stringParameters(params)).to.include(
                '"x-api-key":"<hidden>"'
            );
            expect(utils.stringParameters(params)).not.to.include("secret");
            expect(utils.stringParameters(params)).not.to.include("fake-api-key");
        });
        it("hides sensitive parameters, headers and nested values case-insensitively", () => {
            const secrets = [
                "s-client-id", "s-client-secret", "s-access-token", "s-password", "s-apikey",
                "s-api-key", "s-x-api-key", "s-authorization", "s-cookie", "s-nested-secret",
                "s-array-token", "s-ims-credentials", "s-private-key", "s-client-id-dash"
            ];
            const params = {
                LOG_LEVEL: "debug",
                url: "https://mybackendserver.com/rest",
                client_id: "s-client-id",
                "client-id": "s-client-id-dash",
                CLIENT_SECRET: "s-client-secret",
                accessToken: "s-access-token",
                Password: "s-password",
                apikey: "s-apikey",
                API_KEY: "s-api-key",
                PRIVATE_KEY: { pem: "s-private-key" },
                __ow_headers: {
                    "X-Api-Key": "s-x-api-key",
                    Authorization: "s-authorization",
                    cookie: "s-cookie",
                    "x-request-id": "abcd",
                },
                backend: {
                    host: "mybackendserver.com",
                    auth: { clientSecret: "s-nested-secret", user: "admin" },
                    imsCredentials: "s-ims-credentials",
                },
                list: [{ token: "s-array-token", id: 1 }],
            };
            const result = utils.stringParameters(params);
            secrets.forEach((secret) => expect(result).not.to.include(secret));

            const parsed = JSON.parse(result);
            expect(parsed.LOG_LEVEL).to.equal("debug");
            expect(parsed.url).to.equal("https://mybackendserver.com/rest");
            expect(parsed.client_id).to.equal("<hidden>");
            expect(parsed.PRIVATE_KEY).to.equal("<hidden>");
            expect(parsed.__ow_headers["x-request-id"]).to.equal("abcd");
            expect(parsed.__ow_headers.Authorization).to.equal("<hidden>");
            expect(parsed.backend.host).to.equal("mybackendserver.com");
            expect(parsed.backend.auth.user).to.equal("admin");
            expect(parsed.backend.auth.clientSecret).to.equal("<hidden>");
            expect(parsed.list[0]).to.deep.equal({ token: "<hidden>", id: 1 });
        });
        it("hides sensitive values in JSON string parameters like GET request variables", () => {
            const params = {
                query: "mutation($email: String!, $password: String!) { generateCustomerToken(email: $email, password: $password) { token } }",
                variables: JSON.stringify({ email: "jane@example.com", password: "s-password" }),
                notJson: "{ not json",
            };
            const parsed = JSON.parse(utils.stringParameters(params));
            expect(parsed.query).to.equal(params.query);
            expect(JSON.parse(parsed.variables)).to.deep.equal({ email: "jane@example.com", password: "<hidden>" });
            expect(parsed.notJson).to.equal("{ not json");
        });
        it("does not modify the parameters", () => {
            const params = {
                client_secret: "s-client-secret",
                nested: { token: "s-token" },
                __ow_headers: { authorization: "Bearer s-bearer" },
            };
            const copy = JSON.parse(JSON.stringify(params));
            utils.stringParameters(params);
            expect(params).to.deep.equal(copy);
        });
        it("supports custom name patterns, as strings or regular expressions", () => {
            const params = { client_secret: "s-client-secret", myCustomField: "custom", other: "visible", ssn: "123" };
            const patterns = [...utils.DEFAULT_SENSITIVE_PARAM_PATTERNS, "my*field", /^SSN$/g];
            // Run twice to make sure that global regular expressions are not stateful
            [1, 2].forEach(() => {
                const parsed = JSON.parse(utils.stringParameters(params, patterns));
                expect(parsed).to.deep.equal({
                    client_secret: "<hidden>",
                    myCustomField: "<hidden>",
                    other: "visible",
                    ssn: "<hidden>",
                });
            });
        });
        it("handles circular references", () => {
            const params = { a: 1, token: "s-token" };
            params.self = params;
            const parsed = JSON.parse(utils.stringParameters(params));
            expect(parsed).to.deep.equal({ a: 1, token: "<hidden>", self: "[Circular]" });
        });
    });

    describe("checkMissingRequestInputs", () => {
        it("({ a: 1, b: 2 }, [a])", () => {
            expect(
                utils.checkMissingRequestInputs({ a: 1, b: 2 }, ["a"])
            ).to.equal(null);
        });
        it("({ a: 1 }, [a, b])", () => {
            expect(
                utils.checkMissingRequestInputs({ a: 1 }, ["a", "b"])
            ).to.equal("missing parameter(s) 'b'");
        });
        it("({ a: { b: { c: 1 } }, f: { g: 2 } }, [a.b.c, f.g.h.i])", () => {
            expect(
                utils.checkMissingRequestInputs(
                    { a: { b: { c: 1 } }, f: { g: 2 } },
                    ["a.b.c", "f.g.h.i"]
                )
            ).to.equal("missing parameter(s) 'f.g.h.i'");
        });
        it("({ a: { b: { c: 1 } }, f: { g: 2 } }, [a.b.c, f.g.h])", () => {
            expect(
                utils.checkMissingRequestInputs(
                    { a: { b: { c: 1 } }, f: { g: 2 } },
                    ["a.b.c", "f"]
                )
            ).to.equal(null);
        });
        it("({ a: 1, __ow_headers: { h: 1, i: 2 } }, undefined, [h])", () => {
            expect(
                utils.checkMissingRequestInputs(
                    { a: 1, __ow_headers: { h: 1, i: 2 } },
                    undefined,
                    ["h"]
                )
            ).to.equal(null);
        });
        it("({ a: 1, __ow_headers: { f: 2 } }, [a], [h, i])", () => {
            expect(
                utils.checkMissingRequestInputs(
                    { a: 1, __ow_headers: { f: 2 } },
                    ["a"],
                    ["h", "i"]
                )
            ).to.equal("missing header(s) 'h,i'");
        });
        it("({ c: 1, __ow_headers: { f: 2 } }, [a, b], [h, i])", () => {
            expect(
                utils.checkMissingRequestInputs(
                    { c: 1 },
                    ["a", "b"],
                    ["h", "i"]
                )
            ).to.equal(
                "missing header(s) 'h,i' and missing parameter(s) 'a,b'"
            );
        });
        it("({ a: 0 }, [a])", () => {
            expect(utils.checkMissingRequestInputs({ a: 0 }, ["a"])).to.equal(
                null
            );
        });
        it("({ a: null }, [a])", () => {
            expect(
                utils.checkMissingRequestInputs({ a: null }, ["a"])
            ).to.equal(null);
        });
        it("({ a: '' }, [a])", () => {
            expect(utils.checkMissingRequestInputs({ a: "" }, ["a"])).to.equal(
                "missing parameter(s) 'a'"
            );
        });
        it("({ a: undefined }, [a])", () => {
            expect(
                utils.checkMissingRequestInputs({ a: undefined }, ["a"])
            ).to.equal("missing parameter(s) 'a'");
        });
    });

    describe("getBearerToken", () => {
        it("({})", () => {
            expect(utils.getBearerToken({})).to.equal(undefined);
        });
        it("({ authorization: Bearer fake, __ow_headers: {} })", () => {
            expect(
                utils.getBearerToken({
                    authorization: "Bearer fake",
                    __ow_headers: {},
                })
            ).to.equal(undefined);
        });
        it("({ authorization: Bearer fake, __ow_headers: { authorization: fake } })", () => {
            expect(
                utils.getBearerToken({
                    authorization: "Bearer fake",
                    __ow_headers: { authorization: "fake" },
                })
            ).to.equal(undefined);
        });
        it("({ __ow_headers: { authorization: Bearerfake} })", () => {
            expect(
                utils.getBearerToken({
                    __ow_headers: { authorization: "Bearerfake" },
                })
            ).to.equal(undefined);
        });
        it("({ __ow_headers: { authorization: Bearer fake} })", () => {
            expect(
                utils.getBearerToken({
                    __ow_headers: { authorization: "Bearer fake" },
                })
            ).to.equal("fake");
        });
        it("({ __ow_headers: { authorization: Bearer fake Bearer fake} })", () => {
            expect(
                utils.getBearerToken({
                    __ow_headers: { authorization: "Bearer fake Bearer fake" },
                })
            ).to.equal("fake Bearer fake");
        });
    });
});
