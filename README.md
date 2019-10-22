[![CircleCI](https://circleci.com/gh/adobe/commerce-cif-graphql-integration-reference.svg?style=svg)](https://circleci.com/gh/adobe/commerce-cif-graphql-integration-reference)
[![codecov](https://codecov.io/gh/adobe/commerce-cif-graphql-integration-reference/branch/master/graph/badge.svg)](https://codecov.io/gh/adobe/commerce-cif-graphql-integration-reference)

# 3rd-Party GraphQL integration with AEM Commerce and CIF on Adobe I/O Runtime

## Introduction

The [CIF (Commerce Integration Framework) GraphQL connector](https://github.com/adobe/commerce-cif-connector) and the [AEM CIF Core Components](https://github.com/adobe/aem-core-cif-components) offer authoring and frontend integration between AEM (Adobe Experience Manager) and Magento. This integration is based on the [Magento GraphQL API](https://devdocs.magento.com/guides/v2.3/graphql/index.html) which offers a very flexible and efficient integration point between AEM and Magento.

In order to support other 3rd-party "non-Magento" commerce platforms, this project implements an example "reference" implementation that demonstrates how a 3rd-party commerce platform can be integrated with the CIF GraphQL connector and the AEM CIF Core Components via the Magento GraphQL API. Note that the integration is currently based on the GraphQL API of Magento 2.3.2.

This enables customers to reuse our existing connector and components in their project by simply exposing the Magento GraphQL API on top of any 3rd-party commerce platform. To offer maximum flexibility and scalability, this "adaptation layer" is deployed on the serverless [Adobe I/O Runtime](https://www.adobe.io/apis/experienceplatform/runtime.html) platform.

## Getting Started

### Project structure

This project is organized around [GraphQL resolvers](https://graphql.org/learn/execution/#root-fields-resolvers). Each resolver is either "local" or "remote". A "local" resolver is deployed and executed in the main Adobe I/O action that processes incoming GraphQL requests: we call this action the `dispatcher`. In contrast, a "remote" resolver is deployed as a separate Adobe I/O Runtime action which is referenced in the dispatcher action configuration and integrated via [schema delegation](https://www.apollographql.com/docs/graphql-tools/schema-delegation/).

All code is organized in the `src` folder.

```
src
├── common
├── local
   ├── dispatcher
├── remote
   ├── cartResolver
```

The `common` folder contains all the code that fetches and converts 3rd-party data into the GraphQL format. These classes can be used either by the local dispatcher action or by remote resolvers.

### Local vs. remote resolvers

The main benefit of having local resolvers is that they all belong to the same `nodejs` process and hence can share data caches in order to optimise the fetching of data. In contrast, a remote resolver executes in a separate action in Adobe I/O Runtime, which means that it cannot share any data cache with the local resolvers. Each remote resolver is integrated with the dispatcher action and the local resolvers via [schema delegation](https://www.apollographql.com/docs/graphql-tools/schema-delegation/) where it implements a sub-part of the entire schema and acts like a remote GraphQL schema. The main benefit of remote resolvers/schemas is that they offer a flexible extensibility pattern to either customize the default Magento GraphQL schema or extend it with extra features. It is also possible to override a local resolver with a remote resolver, for example to customize a resolver on a project basis. 

Note that the loader and data classes in this project are developed in a way so that they can be used in local or remote resolvers. We strongly advise that a real implementation follows the same development pattern.

## Architecture

The following diagrams illustrate the architecture of this reference implementation. It shows how introspection is performed in order to build the final entire schema, and how a GraphQL data query is executed.

![GraphQL introspection](images/graphql-introspection.png)

![GraphQL query execution](images/graphql-query-execution.png)

## How to build, test, and deploy

### Tools

Make sure you have the following tools installed:
* Node 10.x
* NPM 6.x
* [OpenWhisk CLI](https://github.com/apache/incubator-openwhisk-cli/releases)

OpenWhisk CLI must be available in your systems PATH and set up correctly to either use a local OpenWhisk installation or an Adobe I/O account. Try `wsk --help` to make sure it is working.

### Build & Deployment

To install all the npm dependencies, and then execute all the unit tests, simply run:
```
$ npm install
$ npm test
```

To deploy the actions on the Adobe I/O Runtime platform, we use the [serverless](https://serverless.com/framework/docs/providers/openwhisk/) framework. The deployment of packages and actions is defined in the `serverless.yml` file. To deploy everything, simply run:
```
$ npm run deploy
```

This will deploy the `graphql-reference/dispatcher` and `graphql-reference/cart` actions in your namespace. The dispatcher is a web action that is accessible with the URL `https://adobeioruntime.net/api/v1/web/NAMESPACE/graphql-reference/dispatcher`. To test the GraphQL endpoint, you can for example use the `GraphiQL` plugin in the Chrome browser. 

## Developing a real 3rd-party integration

This repository provides a reference implementation that can be used as a starting point to develop a real integration with a 3rd-party commerce system. In order to implement a real integration, one will have to:
* modify all the `*Loader.js` classes so that they would fetch data via the 3rd-party commerce system (the loaders currently return some "dummy" example data)
* modify all the `__convertData` conversion methods in the data classes, to convert the data from the 3rd-party system into Magento GraphQL objects
* modify and extend the `getter` methods in the data classes, to support all the fields not covered by the example integration
* introduce new local and/or remote resolvers, to incrementally support more fields of the Magento GraphQL API

### Contributing

Contributions are welcomed! Read the [Contributing Guide](.github/CONTRIBUTING.md) for more information.

### Licensing

This project is licensed under the Apache V2 License. See [LICENSE](LICENSE) for more information.