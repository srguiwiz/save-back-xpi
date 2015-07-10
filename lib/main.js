//
// Copyright (c) 2012-2015, Nirvana Research
// All rights reserved.
//
// Redistribution and use in source and binary forms, with or without
// modification, are permitted provided that the following conditions are met:
//     * Redistributions of source code must retain the above copyright
//       notice, this list of conditions and the following disclaimer.
//     * Redistributions in binary form must reproduce the above copyright
//       notice, this list of conditions and the following disclaimer in the
//       documentation and/or other materials provided with the distribution.
//     * Neither the name of the copyright holder nor the names of
//       contributors may be used to endorse or promote products derived from
//       this software without specific prior written permission.
//
// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDER AND CONTRIBUTORS "AS IS" AND
// ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
// WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
// DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER BE LIABLE FOR ANY DIRECT,
// INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING,
// BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
// DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY
// OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
// NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE,
// EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
//
// i.e. Modified BSD License
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
    var data = require("sdk/self").data;
    //
    var actionButton = null;
    var contextMenuItem = null;
    
    // a required friendly string description of the action button used for
    // accessibility, title bars, and error reporting
    var friendlyName = "Save Back to File from DOM";
    
    var getOnlyIfURIMatchesRegExp = function getOnlyIfURIMatchesRegExp () {
        var prefs = require("sdk/simple-prefs").prefs;
        var onlyIfURIMatchesRegEx = prefs.onlyIfURIMatchesRegEx;
        if (onlyIfURIMatchesRegEx) {
            onlyIfURIMatchesRegEx = onlyIfURIMatchesRegEx.trim();
        }
        if (!onlyIfURIMatchesRegEx) {
            return null;
        }
        return new RegExp(onlyIfURIMatchesRegEx);
    };
    
    var doIt = function doIt () {
        var tab = require("sdk/tabs").activeTab;
        var url = tab.url;
        //
        var onlyIfURIMatchesRegExp = getOnlyIfURIMatchesRegExp();
        if (onlyIfURIMatchesRegExp && !onlyIfURIMatchesRegExp.test(url)) {
            console.log("not saving because not a matching url " + url);
            return;
        }
        //
        var fileSchemaRegExp = /^file:\/\/(.*)$/;
        var match = fileSchemaRegExp.exec(url);
        if (match == null) {
            console.log("not saving because not a file:// url " + url);
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
        var file = require("sdk/io/file");
        if (!file.exists(path)) {
            console.log("not saving because apparently file doesn't exist at " + path);
            return;
        }
        //
        var workers = require("sdk/content/worker");
        var serialized = null;
        let worker = tab.attach({
            contentScript:
                "self.port.once('serialize', function(message) {" +
                "  var documentAsString = 'failed serializing';" + // default
                "  try {" +
                "    var serializer = new XMLSerializer();" +
                "    documentAsString = serializer.serializeToString(window.content.document);" +
                "  } finally {" +
                "    self.port.emit('serialized', documentAsString);" +
                "  }" +
                "});"
        });
        worker.port.once("serialized", function (documentAsString) {
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
                        console.log("apparently saved by overwriting file at " + path);
                    } else {
                        console.log("apparently not saved because failed attempting to overwrite file at " + path);
                    }
                }
            } finally {
                worker.destroy();
            }
        });
        worker.port.emit("serialize", "please");
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

    var onShowActionButtonChange = function onShowActionButtonChange () {
        var prefs = require("sdk/simple-prefs").prefs;
        setActionButtonExistence(prefs.showActionButton);
    };
    onShowActionButtonChange();

    require("sdk/simple-prefs").on("showActionButton",onShowActionButtonChange);

    // the context menu item
    // https://addons.mozilla.org/en-US/developers/docs/sdk/latest/packages/addon-kit/context-menu.html
    contextMenuItem = contextMenuModule.Item({
        label: friendlyName,
        context: [
            contextMenuModule.URLContext("file://*"),
            contextMenuModule.SelectorContext("*")
        ],
        contentScript:
            "self.on('click', function () {" +
            "  self.postMessage('saveFromDomInvokedFromMenuItem');" +
            "});",
        onMessage: function (message) {
            doIt();
        }
    });
};

