require({cache:{
'AppSwitcher/AppSwitcher':function(){
/*jslint indent: 4, forin: true */
/*global dojo, logger, mx, window*/
require([
    "dojo/_base/declare",
    "mxui/widget/_WidgetBase",
    "dojo/io/script",
    "dojo/dom-class"
], function (declare, _WidgetBase, ioScript, domClass) {

    return declare("AppSwitcher.AppSwitcher", _WidgetBase, {
        inputargs: {
            mendixserver: ''
        },

        postCreate: function () {
            domClass.add(this.domNode, "mx-appswitcher-button-placeholder");

            var url = this.mendixserver + (this.mendixserver.match(/\/$/) != null ? "" : "/");

            if (!window.mxButtonSettings) {
                window.mxButtonSettings = {
                    baseUrl: url
                };
            }

            window.mxButtonSettings.baseUrl = url;
            window.mxButtonSettings.started = false;
            window.mxButtonSettings.appSwitcherHeight = this.frameHeight;
            window.mxButtonSettings.appSwitcherWidth = this.frameWidth;
            window.mxButtonSettings.appSwitcherIconColor = this.iconColor;
            window.mxButtonSettings.appSwitcherIconSize = this.iconSize;
            window.mxButtonSettings.appSwitcherPopupBehavior = this.popupBehavior;

            ioScript.get({
                url: url + 'mendixtoolbar/js/buttonservices.js?PP_6.20',
                error: dojo.hitch(this, function (e) {
                    console && console.log('Mendix AppSwitcher could not load external script: ', e);
                })
            });
        },
        
        uninitialize: function () {
            if (typeof window.mxButtons !== "undefined") {
                window.mxButtons.uninitializeAppSwitcher();
            }
        }

    });
});
},
'dojo/io/script':function(){
define([
	"../_base/connect", /*===== "../_base/declare", =====*/ "../_base/kernel", "../_base/lang",
	"../sniff", "../_base/window","../_base/xhr",
	"../dom", "../dom-construct", "../request/script", "../aspect"
], function(connect, /*===== declare, =====*/ kernel, lang, has, win, xhr, dom, domConstruct, _script, aspect){

	// module:
	//		dojo/io/script

	kernel.deprecated("dojo/io/script", "Use dojo/request/script.", "2.0");

	/*=====
	var __ioArgs = declare(kernel.__IoArgs, {
		// summary:
		//		All the properties described in the dojo.__ioArgs type, apply to this
		//		type as well, EXCEPT "handleAs". It is not applicable to
		//		dojo/io/script.get() calls, since it is implied by the usage of
		//		"jsonp" (response will be a JSONP call returning JSON)
		//		or the response is pure JavaScript defined in
		//		the body of the script that was attached.
		// callbackParamName: String
		//		Deprecated as of Dojo 1.4 in favor of "jsonp", but still supported for
		//		legacy code. See notes for jsonp property.
		// jsonp: String
		//		The URL parameter name that indicates the JSONP callback string.
		//		For instance, when using Yahoo JSONP calls it is normally,
		//		jsonp: "callback". For AOL JSONP calls it is normally
		//		jsonp: "c".
		// checkString: String
		//		A string of JavaScript that when evaluated like so:
		//		"typeof(" + checkString + ") != 'undefined'"
		//		being true means that the script fetched has been loaded.
		//		Do not use this if doing a JSONP type of call (use callbackParamName instead).
		// frameDoc: Document
		//		The Document object for a child iframe. If this is passed in, the script
		//		will be attached to that document. This can be helpful in some comet long-polling
		//		scenarios with Firefox and Opera.
	});
	=====*/

	var script = {
		// summary:
		//		TODOC

		get: function(/*__ioArgs*/ args){
			// summary:
			//		sends a get request using a dynamically created script tag.
			var rDfd;
			var dfd = this._makeScriptDeferred(args, function(dfd){
				rDfd && rDfd.cancel();
			});
			var ioArgs = dfd.ioArgs;
			xhr._ioAddQueryToUrl(ioArgs);

			xhr._ioNotifyStart(dfd);

			rDfd = _script.get(ioArgs.url, {
				timeout: args.timeout,
				jsonp: ioArgs.jsonp,
				checkString: args.checkString,
				ioArgs: ioArgs,
				frameDoc: args.frameDoc,
				canAttach: function(rDfd){
					// sync values
					ioArgs.requestId = rDfd.id;
					ioArgs.scriptId = rDfd.scriptId;
					ioArgs.canDelete = rDfd.canDelete;

					return script._canAttach(ioArgs);
				}
			}, true);

			// Run _validCheck at the same time dojo/request/watch runs the
			// rDfd.isValid function
			aspect.around(rDfd, "isValid", function(isValid){
				return function(response){
					script._validCheck(dfd);
					return isValid.call(this, response);
				};
			});

			rDfd.then(function(){
				dfd.resolve(dfd);
			}).otherwise(function(error){
				dfd.ioArgs.error = error;
				dfd.reject(error);
			});

			return dfd;
		},

		attach: _script._attach,
		remove: _script._remove,

		_makeScriptDeferred: function(/*Object*/ args, /*Function?*/ cancel){
			// summary:
			//		sets up a Deferred object for an IO request.
			var dfd = xhr._ioSetArgs(args, cancel || this._deferredCancel, this._deferredOk, this._deferredError);

			var ioArgs = dfd.ioArgs;
			ioArgs.id = kernel._scopeName + "IoScript" + (this._counter++);
			ioArgs.canDelete = false;

			//Special setup for jsonp case
			ioArgs.jsonp = args.callbackParamName || args.jsonp;
			if(ioArgs.jsonp){
				//Add the jsonp parameter.
				ioArgs.query = ioArgs.query || "";
				if(ioArgs.query.length > 0){
					ioArgs.query += "&";
				}
				ioArgs.query += ioArgs.jsonp +
					"=" + (args.frameDoc ? "parent." : "") +
					kernel._scopeName + ".io.script.jsonp_" + ioArgs.id + "._jsonpCallback";

				ioArgs.frameDoc = args.frameDoc;

				//Setup the Deferred to have the jsonp callback.
				ioArgs.canDelete = true;
				dfd._jsonpCallback = this._jsonpCallback;
				this["jsonp_" + ioArgs.id] = dfd;
			}
			// Make sure this runs no matter what happens to clean things up if need be
			dfd.addBoth(function(value){
				if(ioArgs.canDelete){
					if(value instanceof Error){
						// Set up a callback that will clean things up for timeouts and cancels
						script["jsonp_" + ioArgs.id]._jsonpCallback = function(){
							// Delete the cached deferred
							delete script["jsonp_" + ioArgs.id];
							if(ioArgs.requestId){
								// Call the dojo/request/script callback to clean itself up as well
								kernel.global[_script._callbacksProperty][ioArgs.requestId]();
							}
						};
					}else{
						script._addDeadScript(ioArgs);
					}
				}
			});
			return dfd; // dojo/_base/Deferred
		},

		_deferredCancel: function(/*Deferred*/ dfd){
			// summary:
			//		canceller function for xhr._ioSetArgs call.

			//DO NOT use "this" and expect it to be script.
			dfd.canceled = true;
		},

		_deferredOk: function(/*Deferred*/ dfd){
			// summary:
			//		okHandler function for xhr._ioSetArgs call.

			//DO NOT use "this" and expect it to be script.
			var ioArgs = dfd.ioArgs;

			//Favor JSONP responses, script load events then lastly ioArgs.
			//The ioArgs are goofy, but cannot return the dfd since that stops
			//the callback chain in Deferred. The return value is not that important
			//in that case, probably a checkString case.
			return ioArgs.json || ioArgs.scriptLoaded || ioArgs;
		},

		_deferredError: function(/*Error*/ error, /*Deferred*/ dfd){
			// summary:
			//		errHandler function for xhr._ioSetArgs call.

			console.log("dojo.io.script error", error);
			return error;
		},

		_deadScripts: [],
		_counter: 1,

		_addDeadScript: function(/*Object*/ ioArgs){
			// summary:
			//		sets up an entry in the deadScripts array.
			script._deadScripts.push({id: ioArgs.id, frameDoc: ioArgs.frameDoc});
			//Being extra paranoid about leaks:
			ioArgs.frameDoc = null;
		},

		_validCheck: function(/*Deferred*/ dfd){
			// summary:
			//		inflight check function to see if dfd is still valid.

			// TODO: why isn't dfd accessed?

			//Do script cleanup here. We wait for one inflight pass
			//to make sure we don't get any weird things by trying to remove a script
			//tag that is part of the call chain (IE 6 has been known to
			//crash in that case).
			var deadScripts = script._deadScripts;
			if(deadScripts && deadScripts.length > 0){
				for(var i = 0; i < deadScripts.length; i++){
					//Remove the script tag
					script.remove(deadScripts[i].id, deadScripts[i].frameDoc);
					//Clean up the deferreds
					delete script["jsonp_" + deadScripts[i].id];
					deadScripts[i].frameDoc = null;
				}
				script._deadScripts = [];
			}

			return true;
		},

		_ioCheck: function(dfd){
			// summary:
			//		inflight check function to see if IO finished.
			// dfd: Deferred
			var ioArgs = dfd.ioArgs;
			//Check for finished jsonp
			if(ioArgs.json || (ioArgs.scriptLoaded && !ioArgs.args.checkString)){
				return true;
			}

			//Check for finished "checkString" case.
			var checkString = ioArgs.args.checkString;
			return checkString && eval("typeof(" + checkString + ") != 'undefined'");


		},

		_resHandle: function(/*Deferred*/ dfd){
			// summary:
			//		inflight function to handle a completed response.
			if(script._ioCheck(dfd)){
				dfd.callback(dfd);
			}else{
				//This path should never happen since the only way we can get
				//to _resHandle is if _ioCheck is true.
				dfd.errback(new Error("inconceivable dojo.io.script._resHandle error"));
			}
		},

		_canAttach: function(/*===== ioArgs =====*/ ){
			// summary:
			//		A method that can be overridden by other modules
			//		to control when the script attachment occurs.
			// ioArgs: Object
			return true;
		},

		_jsonpCallback: function(/*JSON Object*/ json){
			// summary:
			//		generic handler for jsonp callback. A pointer to this function
			//		is used for all jsonp callbacks.  NOTE: the "this" in this
			//		function will be the Deferred object that represents the script
			//		request.
			this.ioArgs.json = json;
			if(this.ioArgs.requestId){
				kernel.global[_script._callbacksProperty][this.ioArgs.requestId](json);
			}
		}
	};

	lang.setObject("dojo.io.script", script);

	/*=====
	script.attach = function(id, url, frameDocument){
		// summary:
		//		creates a new `<script>` tag pointing to the specified URL and
		//		adds it to the document.
		// description:
		//		Attaches the script element to the DOM. Use this method if you
		//		just want to attach a script to the DOM and do not care when or
		//		if it loads.
	};
	script.remove = function(id, frameDocument){
		// summary:
		//		removes the script element with the given id, from the given frameDocument.
		//		If no frameDocument is passed, the current document is used.
	};
	=====*/

	return script;
});

},
'dojo/request/script':function(){
define([
	'module',
	'./watch',
	'./util',
	'../_base/kernel',
	'../_base/array',
	'../_base/lang',
	'../on',
	'../dom',
	'../dom-construct',
	'../has',
	'../_base/window'/*=====,
	'../request',
	'../_base/declare' =====*/
], function(module, watch, util, kernel, array, lang, on, dom, domConstruct, has, win/*=====, request, declare =====*/){
	has.add('script-readystatechange', function(global, document){
		var script = document.createElement('script');
		return typeof script['onreadystatechange'] !== 'undefined' &&
			(typeof global['opera'] === 'undefined' || global['opera'].toString() !== '[object Opera]');
	});

	var mid = module.id.replace(/[\/\.\-]/g, '_'),
		counter = 0,
		loadEvent = has('script-readystatechange') ? 'readystatechange' : 'load',
		readyRegExp = /complete|loaded/,
		callbacks = kernel.global[mid + '_callbacks'] = {},
		deadScripts = [];

	function attach(id, url, frameDoc){
		var doc = (frameDoc || win.doc),
			element = doc.createElement('script');

		element.type = 'text/javascript';
		element.src = url;
		element.id = id;
		element.async = true;
		element.charset = 'utf-8';

		return doc.getElementsByTagName('head')[0].appendChild(element);
	}

	function remove(id, frameDoc, cleanup){
		domConstruct.destroy(dom.byId(id, frameDoc));

		if(callbacks[id]){
			if(cleanup){
				// set callback to a function that deletes itself so requests that
				// are in-flight don't error out when returning and also
				// clean up after themselves
				callbacks[id] = function(){
					delete callbacks[id];
				};
			}else{
				delete callbacks[id];
			}
		}
	}

	function _addDeadScript(dfd){
		// Be sure to check ioArgs because it can dynamically change in the dojox/io plugins.
		// See http://bugs.dojotoolkit.org/ticket/15890.
		var options = dfd.response.options,
			frameDoc = options.ioArgs ? options.ioArgs.frameDoc : options.frameDoc;

		deadScripts.push({ id: dfd.id, frameDoc: frameDoc });

		if(options.ioArgs){
			options.ioArgs.frameDoc = null;
		}
		options.frameDoc = null;
	}

	function canceler(dfd, response){
		if(dfd.canDelete){
			//For timeouts and cancels, remove the script element immediately to
			//avoid a response from it coming back later and causing trouble.
			script._remove(dfd.id, response.options.frameDoc, true);
		}
	}
	function isValid(response){
		//Do script cleanup here. We wait for one inflight pass
		//to make sure we don't get any weird things by trying to remove a script
		//tag that is part of the call chain (IE 6 has been known to
		//crash in that case).
		if(deadScripts && deadScripts.length){
			array.forEach(deadScripts, function(_script){
				script._remove(_script.id, _script.frameDoc);
				_script.frameDoc = null;
			});
			deadScripts = [];
		}

		return response.options.jsonp ? !response.data : true;
	}
	function isReadyScript(response){
		return !!this.scriptLoaded;
	}
	function isReadyCheckString(response){
		var checkString = response.options.checkString;

		return checkString && eval('typeof(' + checkString + ') !== "undefined"');
	}
	function handleResponse(response, error){
		if(this.canDelete){
			_addDeadScript(this);
		}
		if(error){
			this.reject(error);
		}else{
			this.resolve(response);
		}
	}

	function script(url, options, returnDeferred){
		var response = util.parseArgs(url, util.deepCopy({}, options));
		url = response.url;
		options = response.options;

		var dfd = util.deferred(
			response,
			canceler,
			isValid,
			options.jsonp ? null : (options.checkString ? isReadyCheckString : isReadyScript),
			handleResponse
		);

		lang.mixin(dfd, {
			id: mid + (counter++),
			canDelete: false
		});

		if(options.jsonp){
			var queryParameter = new RegExp('[?&]' + options.jsonp + '=');
			if(!queryParameter.test(url)){
				url += (~url.indexOf('?') ? '&' : '?') +
					options.jsonp + '=' +
					(options.frameDoc ? 'parent.' : '') +
					mid + '_callbacks.' + dfd.id;
			}

			dfd.canDelete = true;
			callbacks[dfd.id] = function(json){
				response.data = json;
				dfd.handleResponse(response);
			};
		}

		if(util.notify){
			util.notify.emit('send', response, dfd.promise.cancel);
		}

		if(!options.canAttach || options.canAttach(dfd)){
			var node = script._attach(dfd.id, url, options.frameDoc);

			if(!options.jsonp && !options.checkString){
				var handle = on(node, loadEvent, function(evt){
					if(evt.type === 'load' || readyRegExp.test(node.readyState)){
						handle.remove();
						dfd.scriptLoaded = evt;
					}
				});
			}
		}

		watch(dfd);

		return returnDeferred ? dfd : dfd.promise;
	}
	script.get = script;
	/*=====
	script = function(url, options){
		// summary:
		//		Sends a request using a script element with the given URL and options.
		// url: String
		//		URL to request
		// options: dojo/request/script.__Options?
		//		Options for the request.
		// returns: dojo/request.__Promise
	};
	script.__BaseOptions = declare(request.__BaseOptions, {
		// jsonp: String?
		//		The URL parameter name that indicates the JSONP callback string.
		//		For instance, when using Yahoo JSONP calls it is normally,
		//		jsonp: "callback". For AOL JSONP calls it is normally
		//		jsonp: "c".
		// checkString: String?
		//		A string of JavaScript that when evaluated like so:
		//		"typeof(" + checkString + ") != 'undefined'"
		//		being true means that the script fetched has been loaded.
		//		Do not use this if doing a JSONP type of call (use `jsonp` instead).
		// frameDoc: Document?
		//		The Document object of a child iframe. If this is passed in, the script
		//		will be attached to that document. This can be helpful in some comet long-polling
		//		scenarios with Firefox and Opera.
	});
	script.__MethodOptions = declare(null, {
		// method: String?
		//		This option is ignored. All requests using this transport are
		//		GET requests.
	});
	script.__Options = declare([script.__BaseOptions, script.__MethodOptions]);

	script.get = function(url, options){
		// summary:
		//		Send an HTTP GET request using a script element with the given URL and options.
		// url: String
		//		URL to request
		// options: dojo/request/script.__BaseOptions?
		//		Options for the request.
		// returns: dojo/request.__Promise
	};
	=====*/

	// TODO: Remove in 2.0
	script._attach = attach;
	script._remove = remove;
	script._callbacksProperty = mid + '_callbacks';

	return script;
});

},
'ProfileMenu/ProfileMenu':function(){
/*jslint indent: 4, forin: true */
/*global dojo, logger, mx, window*/
require([
    "dojo/_base/declare",
    "mxui/widget/_WidgetBase",
    "dojo/io/script",
    "dojo/dom-class"
], function (declare, _WidgetBase, ioScript, domClass) {

    return declare("ProfileMenu.ProfileMenu", _WidgetBase, {
    	inputargs: {
    		mendixserver : ''
    	},

    	postCreate : function() {
			domClass.add(this.domNode, "mx-profilemenu-button-placeholder");

             var url = this.mendixserver + (this.mendixserver.match(/\/$/) != null ? "" : "/");
            
			if (!window.mxButtonSettings) {
                window.mxButtonSettings = {
                    baseUrl: url
                };
            }

            window.mxButtonSettings.baseUrl = url;
            window.mxButtonSettings.started = false;
            window.mxButtonSettings.profileMenuHeight = this.frameHeight;
            window.mxButtonSettings.profileMenuWidth = this.frameWidth;
            window.mxButtonSettings.profileMenuIconColor = this.iconColor;
            window.mxButtonSettings.profileMenuIconSize = this.iconSize;
            window.mxButtonSettings.profileMenuPopupBehavior = this.popupBehavior;

            ioScript.get({
                url: url + 'mendixtoolbar/js/buttonservices.js?PP_6.20',
                error: dojo.hitch(this, function (e) {
                    console && console.log('Mendix Profile Menu could not load external script: ', e);
                })
            });
		},
        
    	uninitialize: function () {
            if (typeof window.mxButtons !== "undefined") {
                window.mxButtons.uninitializeProfileMenu();
            }
        }

    });
});
},
'SprintrFeedbackWidget/SprintrFeedback':function(){
/*jslint indent: 4, forin: true */
/*global dojo, logger, mx, window*/
require([
    "dojo/_base/declare",
    "mxui/widget/_WidgetBase",
    "dojo/io/script"
], function (declare, _WidgetBase, ioScript) {

    return declare("SprintrFeedbackWidget.SprintrFeedback", _WidgetBase, {
	    inputargs: {

			sprintrapp : '',
			entity : '',
			usernameattr : '',
			emailattr : '',
			allowFile : true,
			allowSshot : false,
			sprintrserver : ''

	    },

		postCreate : function(){
			if (!window.sprintrFeedback) {
				var url = this.sprintrserver + (this.sprintrserver.match(/\/$/) != null ? "" : "/");
				ioScript.attach("sprintrfeedbackWrapper", url + "feedback/sprintrfeedback.js");

				this.checkScript(function () { return typeof window.sprintrFeedback != "undefined";}, dojo.hitch(this, function() {
					mx.addOnLoad(dojo.hitch(this, this.loadData));
				}), 0);
			} else {
				mx.addOnLoad(dojo.hitch(this, this.loadData));
			}
		},
		loadData : function () {
			if (this.entity !== '' && !!mx.session.getUserId()) {
				mx.data.get({
					guid : mx.session.getUserId(),
					callback : dojo.hitch(this, this.startFeedback),
					error: function(e) {
						alert("Error while loading feedback form: " +e);
					}
				});
			} else {
				this.startFeedback(null);
			}
		},
		startFeedback : function (userobj) {
			var data = {
				'sprintrid' : this.sprintrapp,
				'allowFile' : this.allowFile,
				'allowSshot' : this.allowSshot
			};
			var username = '';
			if (userobj != null && this.usernameattr != '' && userobj.has(this.usernameattr))
				username = userobj.get(this.usernameattr)
			else if (mx.session.getUserId() > 0 && mx.session.isGuest && !mx.session.isGuest())
				username = mx.session.getUserName();

			var emailaddr =
				(userobj != null && this.emailattr != '' && userobj.has(this.emailattr))
				? userobj.get(this.emailattr)
				: (username.match(/.+@.+\..+/) ? username : ''); //if it looks like an email address, it is one.

			var roles = mx.session.getUserRoles();
			var rolenames = [];
			for(var i = 0; i < roles.length; i++)
				rolenames.push(roles[i].get("Name"));

			data.userdata = {
				'username' : username,
				'emailaddress' : emailaddr,
				'userroles' : rolenames.join(" ") + " (account: " + username + ")"
			};
			window.sprintrFeedback.create(data);
		},
		checkScript : function (elem, cb, counter) {
	        if (elem()) {
	            cb();
	        } else {
	            if (counter < 30) {
	                setTimeout(dojo.hitch(this, function () {
	                    this.checkScript(elem, cb, counter+1);
	                }), 50);
	            }
	        }
	    },
		uninitialize : function(){
		}
	});
});
},
'*noref':1}});
define("widgets/widgets", [
"AppSwitcher/AppSwitcher",
"ProfileMenu/ProfileMenu",
"SprintrFeedbackWidget/SprintrFeedback"
], function() {});