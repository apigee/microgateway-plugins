# Sample Plugin - AccessControl

## Overview
This plugin provides IP filtering to Edge Microgateway. With this plugin, users can whitelist and/or blacklist IP Addresses.

## Enable the plugin
Include the plugin the in plugin sequence of {org}-{env}-config.yaml file:
```
  plugins:
    sequence:
      - oauth
      - accesscontrol
```

## Configure the plugin
The plugin configuration has three parts:
* (instance) Defining the microgateway instance. This registers microgateway with Eureka
* (eureka) Provide the endpoint details to where Eureka is hosted
* (lookup) See below for details
```
accesscontrol:
	allow:
	    - 10.10.10.10
	    - 11.*.11.*
	deny:
	    - 12.12.12.*
```
