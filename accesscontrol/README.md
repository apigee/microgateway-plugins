# AccessControl Plugin

## Overview

This plugin provides IP filtering to Edge Microgateway. With this plugin, users can whitelist and/or blacklist IP Addresses.

## When to use this plugin?

Use this plugin when you want to restrict or allow the API requests to Edge Microgateway for specific endpoints or IPs.

## Plugin configuration properties

You can set the following properties in the `accesscontrol` plugin in the Edge Microgateway configuration file.

```yaml
accesscontrol:

  allow: 
	- 10.11.12.13
	- 127.*.*.*
  # This property enables us to specify multiple IPs/endpoints for which we want to allow the API requests to Edge Microgateway 
  # we can specify the IPs with wildcards as well.

  deny:
	- 11.11.11.11
	- 215.*.*.*

  # This property enables us to specify multiple IPs/ endpoints for which we want to restrict/deny the API requests to Edge Microgateway 
  # we can specify the IPs with wildcards as well.

  noRuleMatchAction: allow / deny

  # when the request IP is not mentioned in any of the above sections (allow and deny), the value of 'noRuleMatchAction' will decide to allow or deny the requests to Edge Microgateway. 
  # Note : this is not a mandatory config, so if not defined, it will by default allow the requests 
```

## Enable the plugin
Include the plugin the in plugin sequence of {org}-{env}-config.yaml file:
```
  plugins:
    sequence:
      - accesscontrol
```

## Configure the plugin
You can set the following properties in the `accesscontrol` plugin in the Edge Microgateway configuration file.

```yaml
accesscontrol:
  # How often the spike arrest execution window resets. Valid values are seconds or minutes.
  # Default: none
	allow:
		- 10.10.10.10
	    - 11.*.11.*
	deny:
		- 12.12.12.*
	noRuleMatchAction: allow	
```

## Use Cases (apart from normal scenario)
Case A : 
	# If the same request IP is present in both of the sections of config yaml (allow and deny), based on the order, “allow” first or “deny” first, it will decide the precedence of the action to be performed. 

For Example: 

Request Source IP : 11.11.11.11  

Config Yaml to deny first: 
 
```yaml
accesscontrol:
  deny: 
	- 12.*.*.* 
	- 11.11.11.11
  allow:
	- 11.11.11.11
```

Config Yaml to allow first: 

```yaml 
accesscontrol:
  allow:
	- 12.*.*.* 
	- 11.11.11.11 
  deny: 
	- 11.11.11.11
```	   
 

Case B :
	# when the request IP is not mentioned in any of the sections, the value of noRuleMatchAction will decide to allow or deny the request.
	# Note : this is not a mandatory config, so if not defined, it will by default allow the requests 

For Example 

Request Source IP : 13.13.13.13 

In Config Yaml: 

```yaml
accesscontrol:
  deny:
    - 10.10.10.10 
  allow: 
    - 12.*.*.* 
    - 11.11.11.11
  noRuleMatchAction: allow
``` 
	# In the case above the request will be allowed to go through as the value of the config noRuleMatchAction: is “allow”. 
 

## The value of ‘noRuleMatchAction’ has to be of string type and it gets validated during the EMG startup, if its enabled/ defined in the config yaml.
