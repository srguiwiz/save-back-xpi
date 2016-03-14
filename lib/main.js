//
// Simplified BSD License
//
// Copyright (c) 2012-2016, Nirvana Research
// All rights reserved.
//
// Redistribution and use in source and binary forms, with or without
// modification, are permitted provided that the following conditions are met:
//     * Redistributions of source code must retain the above copyright
//       notice, this list of conditions and the following disclaimer.
//     * Redistributions in binary form must reproduce the above copyright
//       notice, this list of conditions and the following disclaimer in the
//       documentation and/or other materials provided with the distribution.
//
// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDER AND CONTRIBUTORS "AS IS" AND
// ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
// WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
// DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR
// ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
// (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
// LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
// ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
// (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
// SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
//
// ==============================================================================
//
// the main module of the save-back-to-file-from-dom Add-on
//
// ==============================================================================
//
// Idea and first implementation - Leo Baschy <srguiwiz12 AT nrvr DOT com>
//

exports.main = function() {

    var uiModule = require("sdk/ui");
    var contextMenuModule= require("sdk/context-menu");
    const {Cc,Ci} = require("chrome");
    //
    var actionButton = null;
    var actionButton2 = null;
    var contextMenuItem = null;
    var contextMenuItem2 = null;
    
    // a required friendly string description of the action button used for
    // accessibility, title bars, and error reporting
    var friendlyName = "Save Back to File from DOM";
    var friendlyName2 = "Save to Result File from DOM";
    
    var getOnlyIfURIMatchesRegEx = function getOnlyIfURIMatchesRegEx () {
        var prefs = require("sdk/simple-prefs").prefs;
        var onlyIfURIMatchesRegEx = prefs.onlyIfURIMatchesRegEx;
        if (onlyIfURIMatchesRegEx) {
            onlyIfURIMatchesRegEx = onlyIfURIMatchesRegEx.trim();
        }
        if (!onlyIfURIMatchesRegEx) {
            return ""; // must be a string
        }
        return onlyIfURIMatchesRegEx;
    };

    var getResultNameSuffix = function getResultNameSuffix () {
        var prefs = require("sdk/simple-prefs").prefs;
        var resultNameSuffix = prefs.resultNameSuffix;
        resultNameSuffix = resultNameSuffix.replace(/[^-._~$@a-zA-Z0-9()[\]{} ]/g, ""); // only allow certain characters
        if (resultNameSuffix) {
            resultNameSuffix = resultNameSuffix.trimRight();
        }
        if (!resultNameSuffix) {
            return ""; // must be a string
        }
        return resultNameSuffix;
    };

    function twoDigitString (number) {
        var string = number.toString();
        return string.length > 1 ? string : "0" + string;
    }

    var doIt = function doIt (toResultFile) {
        var resultNameSuffix = getResultNameSuffix();
        toResultFile = toResultFile && resultNameSuffix; // force false if empty resultNameSuffix
        var doingWhat = !toResultFile ? "Save Back to File" : "Save to Result File";
        //
        var tab = require("sdk/tabs").activeTab;
        var url = tab.url;
        //
        var prefs = require("sdk/simple-prefs").prefs;
        var prompts = Cc["@mozilla.org/embedcomp/prompt-service;1"].getService(Ci.nsIPromptService);
        //
        var fileSchemaRegExp = /^file:\/\/(.*)$/;
        var match = fileSchemaRegExp.exec(url);
        if (match == null) {
            console.log("not saving because not a file:// url " + url);
            prompts.alert(null, "Cannot " + doingWhat, "Cannot " + doingWhat + " because not a file:// URI.");
            return;
        }
        var path = match[1];
        path = decodeURIComponent(path); // e.g. %20 to space
        //
        var windowsFileRegExp = /^\/([A-Za-z]:.*)$/;
        var match = windowsFileRegExp.exec(path);
        if (match != null) {
            path = match[1];
            var slashRegExp = /\//g;
            path = path.replace(slashRegExp, "\\");
            console.log("Windows path " + path);
        } else {
            console.log("path " + path);
        }
        //
        var onlyIfURIMatchesRegEx = getOnlyIfURIMatchesRegEx();
        var onlyIfURIMatchesRegExp = onlyIfURIMatchesRegEx ? new RegExp(onlyIfURIMatchesRegEx) : null;
        if (onlyIfURIMatchesRegExp && !onlyIfURIMatchesRegExp.test(url)) {
            console.log("not saving because URI " + url + " not matching " + onlyIfURIMatchesRegEx);
            prompts.alert(null, "Cannot " + doingWhat, "Will not " + doingWhat + " because URI not matching " + onlyIfURIMatchesRegEx);
            return;
        }
        //
        var file = require("sdk/io/file");
        if (!file.exists(path)) {
            console.log("not saving because apparently file doesn't exist at " + path);
            prompts.alert(null, "Cannot " + doingWhat, "Will not " + doingWhat + " because file does not exist at " + path);
            return;
        }
        //
        if ((!toResultFile && prefs.showConfirmationDialog) || (toResultFile && prefs.showConfirmationDialog2)) {
            // https://developer.mozilla.org/en-US/Add-ons/Overlay_Extensions/XUL_School/Adding_windows_and_dialogs
            // https://developer.mozilla.org/en-US/docs/Mozilla/Tech/XPCOM/Reference/Interface/nsIPromptService
            var checkboxParameter = { value: false };
            confirmed = prompts.confirmCheck
                (null, "Confirm " + doingWhat, "Are you sure you want to " + doingWhat + (!toResultFile ? " and overwrite existing file" : "") + "?",
                 "Don't ask again", checkboxParameter);
            if (checkboxParameter.value) {
                if (!toResultFile) {
                    prefs.showConfirmationDialog = false;
                } else {
                    prefs.showConfirmationDialog2 = false;
                }
            }
            if (!confirmed) {
                console.log("not saving because user cancelled");
                return;
            }
        }
        //
        if (toResultFile) {
            var now = new Date();
            var utc =
                now.getUTCFullYear().toString() + twoDigitString(now.getUTCMonth() + 1) + twoDigitString(now.getUTCDate()) +
                twoDigitString(now.getUTCHours()) + twoDigitString(now.getUTCMinutes()) + twoDigitString(now.getUTCSeconds());
            resultNameSuffix = resultNameSuffix.replace(/utc\s*\(\s*\)/ig, utc);
            // from example.svg make example-result.svg
            // instead of using http://stackoverflow.com/questions/3561493/is-there-a-regexp-escape-function-in-javascript
            // with path = path.replace(/^(.*?)(\.[^.]*|)$/g, "$1-result$2");
            // do this more pedestrian
            var pathSplitExtensionMatch = /^(.*?)(\.[^.]*|)$/.exec(path); // made to always match
            path = pathSplitExtensionMatch[1] + resultNameSuffix + pathSplitExtensionMatch[2];
        }
        //
        var workers = require("sdk/content/worker");
        var serialized = null;
        let worker = tab.attach({
            contentScript:
                "self.port.once('nrvrDomSerialize', function(message) {" +
                "  var documentAsString = null;" + // default
                "  try {" +
                "    var serializer = new XMLSerializer();" +
                "    documentAsString = serializer.serializeToString(window.content.document);" +
                "  } finally {" +
                "    self.port.emit('nrvrDomSerialized', documentAsString);" +
                "  }" +
                "});"
        });
        worker.port.once("nrvrDomSerialized", function (documentAsString) {
            try {
                if (!documentAsString) {
                    console.log("apparently not saved because failed serializing document, originally from " + url);
                    return;
                }
                var success = false;
                try {
                    var wrote = false;
                    var textWriter = file.open(path, "w");
                    try {
                        textWriter.write(documentAsString);
                        wrote = true;
                    } finally {
                        if (textWriter && !textWriter.closed) {
                            textWriter.close();
                            if (wrote) {
                                success = true;
                            }
                        }
                    }
                } finally {
                    if (success) {
                        console.log("apparently saved by writing file at " + path);
                    } else {
                        console.log("apparently not saved because failed attempting to write file at " + path);
                    }
                }
            } finally {
                worker.destroy();
            }
        });
        worker.port.emit("nrvrDomSerialize", "please");
    };

    // the UI
    // https://developer.mozilla.org/en-US/Add-ons/SDK/High-Level_APIs/ui
    // https://developer.mozilla.org/en-US/Add-ons/SDK/Low-Level_APIs/ui_button_action
    var newActionButton = function newActionButton () {
        return uiModule.ActionButton({
            // mandatory string used to identify your action button in order to
            // save its location when the user moves it in the browser;
            // has to be unique and must not be changed over time
            id: "save-back-to-file-from-dom-1",

            label: friendlyName,

            icon: "./savebacktofile.png",

            // function to trigger when the action button is clicked
            onClick: function() {
                doIt();
            }
        });
    };
    var newActionButton2 = function newActionButton2 () {
        return uiModule.ActionButton({
            // mandatory string used to identify your action button in order to
            // save its location when the user moves it in the browser;
            // has to be unique and must not be changed over time
            id: "save-back-to-file-from-dom-2",

            label: friendlyName2,

            icon: "./savetoresultfile.png",

            // function to trigger when the action button is clicked
            onClick: function() {
                doIt(true);
            }
        });
    };

    var setActionButtonExistence = function setActionButtonExistence (toExist) {
        if (actionButton && toExist) {
            return;
        }
        if (!actionButton && !toExist) {
            return;
        }
        if (toExist) {
            actionButton = newActionButton();
        } else {
            actionButton.destroy();
            actionButton = null;
        }
    };
    var setActionButtonExistence2 = function setActionButtonExistence2 (toExist) {
        if (actionButton2 && toExist) {
            return;
        }
        if (!actionButton2 && !toExist) {
            return;
        }
        if (toExist) {
            actionButton2 = newActionButton2();
        } else {
            actionButton2.destroy();
            actionButton2 = null;
        }
    };

    var onShowActionButtonChange = function onShowActionButtonChange () {
        var prefs = require("sdk/simple-prefs").prefs;
        setActionButtonExistence(prefs.showActionButton);
    };
    onShowActionButtonChange();
    require("sdk/simple-prefs").on("showActionButton",onShowActionButtonChange);

    var onShowActionButtonChange2 = function onShowActionButtonChange2 () {
        var prefs = require("sdk/simple-prefs").prefs;
        setActionButtonExistence2(prefs.showActionButton2);
    };
    onShowActionButtonChange2();
    require("sdk/simple-prefs").on("showActionButton2",onShowActionButtonChange2);

    var onResultNameSuffixChange = function onResultNameSuffixChange () {
        var prefs = require("sdk/simple-prefs").prefs;
        if (getResultNameSuffix() !== prefs.resultNameSuffix) {
            // give user feedback how it only allows certain characters
            prefs.resultNameSuffix = getResultNameSuffix();
        }
    };
    require("sdk/simple-prefs").on("resultNameSuffix",onResultNameSuffixChange);

    // the context menu items
    // https://addons.mozilla.org/en-US/developers/docs/sdk/latest/packages/addon-kit/context-menu.html
    contextMenuItem = contextMenuModule.Item({
        label: friendlyName,
        context: [
            contextMenuModule.URLContext("file://*"),
            contextMenuModule.SelectorContext("*")
        ],
        onMessage: function (message) {
            doIt();
        }
    });
    contextMenuItem2 = contextMenuModule.Item({
        label: friendlyName2,
        context: [
            contextMenuModule.URLContext("file://*"),
            contextMenuModule.SelectorContext("*")
        ],
        onMessage: function (message) {
            doIt(true);
        }
    });
};

