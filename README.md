# 3rd-Party GraphQL integration with AEM Commerce and CIF on Adobe I/O Runtime

## Introduction

The [CIF (Commerce Integration Framework) GraphQL connector](https://github.com/adobe/commerce-cif-connector) and the [AEM CIF Core Components](https://github.com/adobe/aem-core-cif-components) offer authoring and frontend integration between AEM (Adobe Experience Manager) and Magento. This integration is based on the [Magento GraphQL API](https://devdocs.magento.com/guides/v2.3/graphql/index.html) which offers a very flxible and efficient integration point between AEM and Magento.

In order to support other 3rd-party commerce platforms, this project implements an example "reference" implementation that demonstrates how a 3rd-party commerce platform can be integrated with the CIF GraphQL connector and the AEM CIF Core Components via the Magento GraphQL API. This enables customers to use our connector and components in their project by simply exposing the Magento GraphQL API on top of any 3rd-party commerce platform. To offer maximum flexibility and sclability, this "adaptation layer" is deployed on the serverless [Adobe I/O Runtime](https://www.adobe.io/apis/experienceplatform/runtime.html) platform.

### Contributing

Contributions are welcomed! Read the [Contributing Guide](.github/CONTRIBUTING.md) for more information.

### Licensing

This project is licensed under the Apache V2 License. See [LICENSE](LICENSE) for more information.