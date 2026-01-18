#!/usr/bin/env bun
// @bun
import { createRequire } from "node:module";
var __create = Object.create;
var __getProtoOf = Object.getPrototypeOf;
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __toESM = (mod, isNodeMode, target) => {
  target = mod != null ? __create(__getProtoOf(mod)) : {};
  const to = isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target;
  for (let key of __getOwnPropNames(mod))
    if (!__hasOwnProp.call(to, key))
      __defProp(to, key, {
        get: () => mod[key],
        enumerable: true
      });
  return to;
};
var __commonJS = (cb, mod) => () => (mod || cb((mod = { exports: {} }).exports, mod), mod.exports);
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, {
      get: all[name2],
      enumerable: true,
      configurable: true,
      set: (newValue) => all[name2] = () => newValue
    });
};
var __esm = (fn, res) => () => (fn && (res = fn(fn = 0)), res);
var __require = /* @__PURE__ */ createRequire(import.meta.url);

// node_modules/commander/lib/error.js
var require_error = __commonJS((exports) => {
  class CommanderError extends Error {
    constructor(exitCode, code, message) {
      super(message);
      Error.captureStackTrace(this, this.constructor);
      this.name = this.constructor.name;
      this.code = code;
      this.exitCode = exitCode;
      this.nestedError = undefined;
    }
  }

  class InvalidArgumentError extends CommanderError {
    constructor(message) {
      super(1, "commander.invalidArgument", message);
      Error.captureStackTrace(this, this.constructor);
      this.name = this.constructor.name;
    }
  }
  exports.CommanderError = CommanderError;
  exports.InvalidArgumentError = InvalidArgumentError;
});

// node_modules/commander/lib/argument.js
var require_argument = __commonJS((exports) => {
  var { InvalidArgumentError } = require_error();

  class Argument {
    constructor(name2, description) {
      this.description = description || "";
      this.variadic = false;
      this.parseArg = undefined;
      this.defaultValue = undefined;
      this.defaultValueDescription = undefined;
      this.argChoices = undefined;
      switch (name2[0]) {
        case "<":
          this.required = true;
          this._name = name2.slice(1, -1);
          break;
        case "[":
          this.required = false;
          this._name = name2.slice(1, -1);
          break;
        default:
          this.required = true;
          this._name = name2;
          break;
      }
      if (this._name.length > 3 && this._name.slice(-3) === "...") {
        this.variadic = true;
        this._name = this._name.slice(0, -3);
      }
    }
    name() {
      return this._name;
    }
    _concatValue(value, previous) {
      if (previous === this.defaultValue || !Array.isArray(previous)) {
        return [value];
      }
      return previous.concat(value);
    }
    default(value, description) {
      this.defaultValue = value;
      this.defaultValueDescription = description;
      return this;
    }
    argParser(fn) {
      this.parseArg = fn;
      return this;
    }
    choices(values) {
      this.argChoices = values.slice();
      this.parseArg = (arg, previous) => {
        if (!this.argChoices.includes(arg)) {
          throw new InvalidArgumentError(`Allowed choices are ${this.argChoices.join(", ")}.`);
        }
        if (this.variadic) {
          return this._concatValue(arg, previous);
        }
        return arg;
      };
      return this;
    }
    argRequired() {
      this.required = true;
      return this;
    }
    argOptional() {
      this.required = false;
      return this;
    }
  }
  function humanReadableArgName(arg) {
    const nameOutput = arg.name() + (arg.variadic === true ? "..." : "");
    return arg.required ? "<" + nameOutput + ">" : "[" + nameOutput + "]";
  }
  exports.Argument = Argument;
  exports.humanReadableArgName = humanReadableArgName;
});

// node_modules/commander/lib/help.js
var require_help = __commonJS((exports) => {
  var { humanReadableArgName } = require_argument();

  class Help {
    constructor() {
      this.helpWidth = undefined;
      this.sortSubcommands = false;
      this.sortOptions = false;
      this.showGlobalOptions = false;
    }
    visibleCommands(cmd) {
      const visibleCommands = cmd.commands.filter((cmd2) => !cmd2._hidden);
      const helpCommand = cmd._getHelpCommand();
      if (helpCommand && !helpCommand._hidden) {
        visibleCommands.push(helpCommand);
      }
      if (this.sortSubcommands) {
        visibleCommands.sort((a, b) => {
          return a.name().localeCompare(b.name());
        });
      }
      return visibleCommands;
    }
    compareOptions(a, b) {
      const getSortKey = (option) => {
        return option.short ? option.short.replace(/^-/, "") : option.long.replace(/^--/, "");
      };
      return getSortKey(a).localeCompare(getSortKey(b));
    }
    visibleOptions(cmd) {
      const visibleOptions = cmd.options.filter((option) => !option.hidden);
      const helpOption = cmd._getHelpOption();
      if (helpOption && !helpOption.hidden) {
        const removeShort = helpOption.short && cmd._findOption(helpOption.short);
        const removeLong = helpOption.long && cmd._findOption(helpOption.long);
        if (!removeShort && !removeLong) {
          visibleOptions.push(helpOption);
        } else if (helpOption.long && !removeLong) {
          visibleOptions.push(cmd.createOption(helpOption.long, helpOption.description));
        } else if (helpOption.short && !removeShort) {
          visibleOptions.push(cmd.createOption(helpOption.short, helpOption.description));
        }
      }
      if (this.sortOptions) {
        visibleOptions.sort(this.compareOptions);
      }
      return visibleOptions;
    }
    visibleGlobalOptions(cmd) {
      if (!this.showGlobalOptions)
        return [];
      const globalOptions = [];
      for (let ancestorCmd = cmd.parent;ancestorCmd; ancestorCmd = ancestorCmd.parent) {
        const visibleOptions = ancestorCmd.options.filter((option) => !option.hidden);
        globalOptions.push(...visibleOptions);
      }
      if (this.sortOptions) {
        globalOptions.sort(this.compareOptions);
      }
      return globalOptions;
    }
    visibleArguments(cmd) {
      if (cmd._argsDescription) {
        cmd.registeredArguments.forEach((argument) => {
          argument.description = argument.description || cmd._argsDescription[argument.name()] || "";
        });
      }
      if (cmd.registeredArguments.find((argument) => argument.description)) {
        return cmd.registeredArguments;
      }
      return [];
    }
    subcommandTerm(cmd) {
      const args2 = cmd.registeredArguments.map((arg) => humanReadableArgName(arg)).join(" ");
      return cmd._name + (cmd._aliases[0] ? "|" + cmd._aliases[0] : "") + (cmd.options.length ? " [options]" : "") + (args2 ? " " + args2 : "");
    }
    optionTerm(option) {
      return option.flags;
    }
    argumentTerm(argument) {
      return argument.name();
    }
    longestSubcommandTermLength(cmd, helper) {
      return helper.visibleCommands(cmd).reduce((max, command) => {
        return Math.max(max, helper.subcommandTerm(command).length);
      }, 0);
    }
    longestOptionTermLength(cmd, helper) {
      return helper.visibleOptions(cmd).reduce((max, option) => {
        return Math.max(max, helper.optionTerm(option).length);
      }, 0);
    }
    longestGlobalOptionTermLength(cmd, helper) {
      return helper.visibleGlobalOptions(cmd).reduce((max, option) => {
        return Math.max(max, helper.optionTerm(option).length);
      }, 0);
    }
    longestArgumentTermLength(cmd, helper) {
      return helper.visibleArguments(cmd).reduce((max, argument) => {
        return Math.max(max, helper.argumentTerm(argument).length);
      }, 0);
    }
    commandUsage(cmd) {
      let cmdName = cmd._name;
      if (cmd._aliases[0]) {
        cmdName = cmdName + "|" + cmd._aliases[0];
      }
      let ancestorCmdNames = "";
      for (let ancestorCmd = cmd.parent;ancestorCmd; ancestorCmd = ancestorCmd.parent) {
        ancestorCmdNames = ancestorCmd.name() + " " + ancestorCmdNames;
      }
      return ancestorCmdNames + cmdName + " " + cmd.usage();
    }
    commandDescription(cmd) {
      return cmd.description();
    }
    subcommandDescription(cmd) {
      return cmd.summary() || cmd.description();
    }
    optionDescription(option) {
      const extraInfo = [];
      if (option.argChoices) {
        extraInfo.push(`choices: ${option.argChoices.map((choice) => JSON.stringify(choice)).join(", ")}`);
      }
      if (option.defaultValue !== undefined) {
        const showDefault = option.required || option.optional || option.isBoolean() && typeof option.defaultValue === "boolean";
        if (showDefault) {
          extraInfo.push(`default: ${option.defaultValueDescription || JSON.stringify(option.defaultValue)}`);
        }
      }
      if (option.presetArg !== undefined && option.optional) {
        extraInfo.push(`preset: ${JSON.stringify(option.presetArg)}`);
      }
      if (option.envVar !== undefined) {
        extraInfo.push(`env: ${option.envVar}`);
      }
      if (extraInfo.length > 0) {
        return `${option.description} (${extraInfo.join(", ")})`;
      }
      return option.description;
    }
    argumentDescription(argument) {
      const extraInfo = [];
      if (argument.argChoices) {
        extraInfo.push(`choices: ${argument.argChoices.map((choice) => JSON.stringify(choice)).join(", ")}`);
      }
      if (argument.defaultValue !== undefined) {
        extraInfo.push(`default: ${argument.defaultValueDescription || JSON.stringify(argument.defaultValue)}`);
      }
      if (extraInfo.length > 0) {
        const extraDescripton = `(${extraInfo.join(", ")})`;
        if (argument.description) {
          return `${argument.description} ${extraDescripton}`;
        }
        return extraDescripton;
      }
      return argument.description;
    }
    formatHelp(cmd, helper) {
      const termWidth = helper.padWidth(cmd, helper);
      const helpWidth = helper.helpWidth || 80;
      const itemIndentWidth = 2;
      const itemSeparatorWidth = 2;
      function formatItem(term, description) {
        if (description) {
          const fullText = `${term.padEnd(termWidth + itemSeparatorWidth)}${description}`;
          return helper.wrap(fullText, helpWidth - itemIndentWidth, termWidth + itemSeparatorWidth);
        }
        return term;
      }
      function formatList(textArray) {
        return textArray.join(`
`).replace(/^/gm, " ".repeat(itemIndentWidth));
      }
      let output = [`Usage: ${helper.commandUsage(cmd)}`, ""];
      const commandDescription = helper.commandDescription(cmd);
      if (commandDescription.length > 0) {
        output = output.concat([
          helper.wrap(commandDescription, helpWidth, 0),
          ""
        ]);
      }
      const argumentList = helper.visibleArguments(cmd).map((argument) => {
        return formatItem(helper.argumentTerm(argument), helper.argumentDescription(argument));
      });
      if (argumentList.length > 0) {
        output = output.concat(["Arguments:", formatList(argumentList), ""]);
      }
      const optionList = helper.visibleOptions(cmd).map((option) => {
        return formatItem(helper.optionTerm(option), helper.optionDescription(option));
      });
      if (optionList.length > 0) {
        output = output.concat(["Options:", formatList(optionList), ""]);
      }
      if (this.showGlobalOptions) {
        const globalOptionList = helper.visibleGlobalOptions(cmd).map((option) => {
          return formatItem(helper.optionTerm(option), helper.optionDescription(option));
        });
        if (globalOptionList.length > 0) {
          output = output.concat([
            "Global Options:",
            formatList(globalOptionList),
            ""
          ]);
        }
      }
      const commandList = helper.visibleCommands(cmd).map((cmd2) => {
        return formatItem(helper.subcommandTerm(cmd2), helper.subcommandDescription(cmd2));
      });
      if (commandList.length > 0) {
        output = output.concat(["Commands:", formatList(commandList), ""]);
      }
      return output.join(`
`);
    }
    padWidth(cmd, helper) {
      return Math.max(helper.longestOptionTermLength(cmd, helper), helper.longestGlobalOptionTermLength(cmd, helper), helper.longestSubcommandTermLength(cmd, helper), helper.longestArgumentTermLength(cmd, helper));
    }
    wrap(str, width, indent, minColumnWidth = 40) {
      const indents = " \\f\\t\\v   -   　\uFEFF";
      const manualIndent = new RegExp(`[\\n][${indents}]+`);
      if (str.match(manualIndent))
        return str;
      const columnWidth = width - indent;
      if (columnWidth < minColumnWidth)
        return str;
      const leadingStr = str.slice(0, indent);
      const columnText = str.slice(indent).replace(`\r
`, `
`);
      const indentString = " ".repeat(indent);
      const zeroWidthSpace = "​";
      const breaks = `\\s${zeroWidthSpace}`;
      const regex = new RegExp(`
|.{1,${columnWidth - 1}}([${breaks}]|$)|[^${breaks}]+?([${breaks}]|$)`, "g");
      const lines = columnText.match(regex) || [];
      return leadingStr + lines.map((line, i2) => {
        if (line === `
`)
          return "";
        return (i2 > 0 ? indentString : "") + line.trimEnd();
      }).join(`
`);
    }
  }
  exports.Help = Help;
});

// node_modules/commander/lib/option.js
var require_option = __commonJS((exports) => {
  var { InvalidArgumentError } = require_error();

  class Option {
    constructor(flags2, description) {
      this.flags = flags2;
      this.description = description || "";
      this.required = flags2.includes("<");
      this.optional = flags2.includes("[");
      this.variadic = /\w\.\.\.[>\]]$/.test(flags2);
      this.mandatory = false;
      const optionFlags = splitOptionFlags(flags2);
      this.short = optionFlags.shortFlag;
      this.long = optionFlags.longFlag;
      this.negate = false;
      if (this.long) {
        this.negate = this.long.startsWith("--no-");
      }
      this.defaultValue = undefined;
      this.defaultValueDescription = undefined;
      this.presetArg = undefined;
      this.envVar = undefined;
      this.parseArg = undefined;
      this.hidden = false;
      this.argChoices = undefined;
      this.conflictsWith = [];
      this.implied = undefined;
    }
    default(value, description) {
      this.defaultValue = value;
      this.defaultValueDescription = description;
      return this;
    }
    preset(arg) {
      this.presetArg = arg;
      return this;
    }
    conflicts(names) {
      this.conflictsWith = this.conflictsWith.concat(names);
      return this;
    }
    implies(impliedOptionValues) {
      let newImplied = impliedOptionValues;
      if (typeof impliedOptionValues === "string") {
        newImplied = { [impliedOptionValues]: true };
      }
      this.implied = Object.assign(this.implied || {}, newImplied);
      return this;
    }
    env(name2) {
      this.envVar = name2;
      return this;
    }
    argParser(fn) {
      this.parseArg = fn;
      return this;
    }
    makeOptionMandatory(mandatory = true) {
      this.mandatory = !!mandatory;
      return this;
    }
    hideHelp(hide = true) {
      this.hidden = !!hide;
      return this;
    }
    _concatValue(value, previous) {
      if (previous === this.defaultValue || !Array.isArray(previous)) {
        return [value];
      }
      return previous.concat(value);
    }
    choices(values) {
      this.argChoices = values.slice();
      this.parseArg = (arg, previous) => {
        if (!this.argChoices.includes(arg)) {
          throw new InvalidArgumentError(`Allowed choices are ${this.argChoices.join(", ")}.`);
        }
        if (this.variadic) {
          return this._concatValue(arg, previous);
        }
        return arg;
      };
      return this;
    }
    name() {
      if (this.long) {
        return this.long.replace(/^--/, "");
      }
      return this.short.replace(/^-/, "");
    }
    attributeName() {
      return camelcase(this.name().replace(/^no-/, ""));
    }
    is(arg) {
      return this.short === arg || this.long === arg;
    }
    isBoolean() {
      return !this.required && !this.optional && !this.negate;
    }
  }

  class DualOptions {
    constructor(options) {
      this.positiveOptions = new Map;
      this.negativeOptions = new Map;
      this.dualOptions = new Set;
      options.forEach((option) => {
        if (option.negate) {
          this.negativeOptions.set(option.attributeName(), option);
        } else {
          this.positiveOptions.set(option.attributeName(), option);
        }
      });
      this.negativeOptions.forEach((value, key) => {
        if (this.positiveOptions.has(key)) {
          this.dualOptions.add(key);
        }
      });
    }
    valueFromOption(value, option) {
      const optionKey = option.attributeName();
      if (!this.dualOptions.has(optionKey))
        return true;
      const preset = this.negativeOptions.get(optionKey).presetArg;
      const negativeValue = preset !== undefined ? preset : false;
      return option.negate === (negativeValue === value);
    }
  }
  function camelcase(str) {
    return str.split("-").reduce((str2, word) => {
      return str2 + word[0].toUpperCase() + word.slice(1);
    });
  }
  function splitOptionFlags(flags2) {
    let shortFlag;
    let longFlag;
    const flagParts = flags2.split(/[ |,]+/);
    if (flagParts.length > 1 && !/^[[<]/.test(flagParts[1]))
      shortFlag = flagParts.shift();
    longFlag = flagParts.shift();
    if (!shortFlag && /^-[^-]$/.test(longFlag)) {
      shortFlag = longFlag;
      longFlag = undefined;
    }
    return { shortFlag, longFlag };
  }
  exports.Option = Option;
  exports.DualOptions = DualOptions;
});

// node_modules/commander/lib/suggestSimilar.js
var require_suggestSimilar = __commonJS((exports) => {
  var maxDistance = 3;
  function editDistance(a, b) {
    if (Math.abs(a.length - b.length) > maxDistance)
      return Math.max(a.length, b.length);
    const d = [];
    for (let i2 = 0;i2 <= a.length; i2++) {
      d[i2] = [i2];
    }
    for (let j = 0;j <= b.length; j++) {
      d[0][j] = j;
    }
    for (let j = 1;j <= b.length; j++) {
      for (let i2 = 1;i2 <= a.length; i2++) {
        let cost = 1;
        if (a[i2 - 1] === b[j - 1]) {
          cost = 0;
        } else {
          cost = 1;
        }
        d[i2][j] = Math.min(d[i2 - 1][j] + 1, d[i2][j - 1] + 1, d[i2 - 1][j - 1] + cost);
        if (i2 > 1 && j > 1 && a[i2 - 1] === b[j - 2] && a[i2 - 2] === b[j - 1]) {
          d[i2][j] = Math.min(d[i2][j], d[i2 - 2][j - 2] + 1);
        }
      }
    }
    return d[a.length][b.length];
  }
  function suggestSimilar(word, candidates) {
    if (!candidates || candidates.length === 0)
      return "";
    candidates = Array.from(new Set(candidates));
    const searchingOptions = word.startsWith("--");
    if (searchingOptions) {
      word = word.slice(2);
      candidates = candidates.map((candidate) => candidate.slice(2));
    }
    let similar = [];
    let bestDistance = maxDistance;
    const minSimilarity = 0.4;
    candidates.forEach((candidate) => {
      if (candidate.length <= 1)
        return;
      const distance = editDistance(word, candidate);
      const length = Math.max(word.length, candidate.length);
      const similarity = (length - distance) / length;
      if (similarity > minSimilarity) {
        if (distance < bestDistance) {
          bestDistance = distance;
          similar = [candidate];
        } else if (distance === bestDistance) {
          similar.push(candidate);
        }
      }
    });
    similar.sort((a, b) => a.localeCompare(b));
    if (searchingOptions) {
      similar = similar.map((candidate) => `--${candidate}`);
    }
    if (similar.length > 1) {
      return `
(Did you mean one of ${similar.join(", ")}?)`;
    }
    if (similar.length === 1) {
      return `
(Did you mean ${similar[0]}?)`;
    }
    return "";
  }
  exports.suggestSimilar = suggestSimilar;
});

// node_modules/commander/lib/command.js
var require_command = __commonJS((exports) => {
  var EventEmitter = __require("node:events").EventEmitter;
  var childProcess = __require("node:child_process");
  var path = __require("node:path");
  var fs2 = __require("node:fs");
  var process2 = __require("node:process");
  var { Argument, humanReadableArgName } = require_argument();
  var { CommanderError } = require_error();
  var { Help } = require_help();
  var { Option, DualOptions } = require_option();
  var { suggestSimilar } = require_suggestSimilar();

  class Command extends EventEmitter {
    constructor(name2) {
      super();
      this.commands = [];
      this.options = [];
      this.parent = null;
      this._allowUnknownOption = false;
      this._allowExcessArguments = true;
      this.registeredArguments = [];
      this._args = this.registeredArguments;
      this.args = [];
      this.rawArgs = [];
      this.processedArgs = [];
      this._scriptPath = null;
      this._name = name2 || "";
      this._optionValues = {};
      this._optionValueSources = {};
      this._storeOptionsAsProperties = false;
      this._actionHandler = null;
      this._executableHandler = false;
      this._executableFile = null;
      this._executableDir = null;
      this._defaultCommandName = null;
      this._exitCallback = null;
      this._aliases = [];
      this._combineFlagAndOptionalValue = true;
      this._description = "";
      this._summary = "";
      this._argsDescription = undefined;
      this._enablePositionalOptions = false;
      this._passThroughOptions = false;
      this._lifeCycleHooks = {};
      this._showHelpAfterError = false;
      this._showSuggestionAfterError = true;
      this._outputConfiguration = {
        writeOut: (str) => process2.stdout.write(str),
        writeErr: (str) => process2.stderr.write(str),
        getOutHelpWidth: () => process2.stdout.isTTY ? process2.stdout.columns : undefined,
        getErrHelpWidth: () => process2.stderr.isTTY ? process2.stderr.columns : undefined,
        outputError: (str, write) => write(str)
      };
      this._hidden = false;
      this._helpOption = undefined;
      this._addImplicitHelpCommand = undefined;
      this._helpCommand = undefined;
      this._helpConfiguration = {};
    }
    copyInheritedSettings(sourceCommand) {
      this._outputConfiguration = sourceCommand._outputConfiguration;
      this._helpOption = sourceCommand._helpOption;
      this._helpCommand = sourceCommand._helpCommand;
      this._helpConfiguration = sourceCommand._helpConfiguration;
      this._exitCallback = sourceCommand._exitCallback;
      this._storeOptionsAsProperties = sourceCommand._storeOptionsAsProperties;
      this._combineFlagAndOptionalValue = sourceCommand._combineFlagAndOptionalValue;
      this._allowExcessArguments = sourceCommand._allowExcessArguments;
      this._enablePositionalOptions = sourceCommand._enablePositionalOptions;
      this._showHelpAfterError = sourceCommand._showHelpAfterError;
      this._showSuggestionAfterError = sourceCommand._showSuggestionAfterError;
      return this;
    }
    _getCommandAndAncestors() {
      const result = [];
      for (let command = this;command; command = command.parent) {
        result.push(command);
      }
      return result;
    }
    command(nameAndArgs, actionOptsOrExecDesc, execOpts) {
      let desc = actionOptsOrExecDesc;
      let opts = execOpts;
      if (typeof desc === "object" && desc !== null) {
        opts = desc;
        desc = null;
      }
      opts = opts || {};
      const [, name2, args2] = nameAndArgs.match(/([^ ]+) *(.*)/);
      const cmd = this.createCommand(name2);
      if (desc) {
        cmd.description(desc);
        cmd._executableHandler = true;
      }
      if (opts.isDefault)
        this._defaultCommandName = cmd._name;
      cmd._hidden = !!(opts.noHelp || opts.hidden);
      cmd._executableFile = opts.executableFile || null;
      if (args2)
        cmd.arguments(args2);
      this._registerCommand(cmd);
      cmd.parent = this;
      cmd.copyInheritedSettings(this);
      if (desc)
        return this;
      return cmd;
    }
    createCommand(name2) {
      return new Command(name2);
    }
    createHelp() {
      return Object.assign(new Help, this.configureHelp());
    }
    configureHelp(configuration) {
      if (configuration === undefined)
        return this._helpConfiguration;
      this._helpConfiguration = configuration;
      return this;
    }
    configureOutput(configuration) {
      if (configuration === undefined)
        return this._outputConfiguration;
      Object.assign(this._outputConfiguration, configuration);
      return this;
    }
    showHelpAfterError(displayHelp = true) {
      if (typeof displayHelp !== "string")
        displayHelp = !!displayHelp;
      this._showHelpAfterError = displayHelp;
      return this;
    }
    showSuggestionAfterError(displaySuggestion = true) {
      this._showSuggestionAfterError = !!displaySuggestion;
      return this;
    }
    addCommand(cmd, opts) {
      if (!cmd._name) {
        throw new Error(`Command passed to .addCommand() must have a name
- specify the name in Command constructor or using .name()`);
      }
      opts = opts || {};
      if (opts.isDefault)
        this._defaultCommandName = cmd._name;
      if (opts.noHelp || opts.hidden)
        cmd._hidden = true;
      this._registerCommand(cmd);
      cmd.parent = this;
      cmd._checkForBrokenPassThrough();
      return this;
    }
    createArgument(name2, description) {
      return new Argument(name2, description);
    }
    argument(name2, description, fn, defaultValue) {
      const argument = this.createArgument(name2, description);
      if (typeof fn === "function") {
        argument.default(defaultValue).argParser(fn);
      } else {
        argument.default(fn);
      }
      this.addArgument(argument);
      return this;
    }
    arguments(names) {
      names.trim().split(/ +/).forEach((detail) => {
        this.argument(detail);
      });
      return this;
    }
    addArgument(argument) {
      const previousArgument = this.registeredArguments.slice(-1)[0];
      if (previousArgument && previousArgument.variadic) {
        throw new Error(`only the last argument can be variadic '${previousArgument.name()}'`);
      }
      if (argument.required && argument.defaultValue !== undefined && argument.parseArg === undefined) {
        throw new Error(`a default value for a required argument is never used: '${argument.name()}'`);
      }
      this.registeredArguments.push(argument);
      return this;
    }
    helpCommand(enableOrNameAndArgs, description) {
      if (typeof enableOrNameAndArgs === "boolean") {
        this._addImplicitHelpCommand = enableOrNameAndArgs;
        return this;
      }
      enableOrNameAndArgs = enableOrNameAndArgs ?? "help [command]";
      const [, helpName, helpArgs] = enableOrNameAndArgs.match(/([^ ]+) *(.*)/);
      const helpDescription = description ?? "display help for command";
      const helpCommand = this.createCommand(helpName);
      helpCommand.helpOption(false);
      if (helpArgs)
        helpCommand.arguments(helpArgs);
      if (helpDescription)
        helpCommand.description(helpDescription);
      this._addImplicitHelpCommand = true;
      this._helpCommand = helpCommand;
      return this;
    }
    addHelpCommand(helpCommand, deprecatedDescription) {
      if (typeof helpCommand !== "object") {
        this.helpCommand(helpCommand, deprecatedDescription);
        return this;
      }
      this._addImplicitHelpCommand = true;
      this._helpCommand = helpCommand;
      return this;
    }
    _getHelpCommand() {
      const hasImplicitHelpCommand = this._addImplicitHelpCommand ?? (this.commands.length && !this._actionHandler && !this._findCommand("help"));
      if (hasImplicitHelpCommand) {
        if (this._helpCommand === undefined) {
          this.helpCommand(undefined, undefined);
        }
        return this._helpCommand;
      }
      return null;
    }
    hook(event, listener) {
      const allowedValues = ["preSubcommand", "preAction", "postAction"];
      if (!allowedValues.includes(event)) {
        throw new Error(`Unexpected value for event passed to hook : '${event}'.
Expecting one of '${allowedValues.join("', '")}'`);
      }
      if (this._lifeCycleHooks[event]) {
        this._lifeCycleHooks[event].push(listener);
      } else {
        this._lifeCycleHooks[event] = [listener];
      }
      return this;
    }
    exitOverride(fn) {
      if (fn) {
        this._exitCallback = fn;
      } else {
        this._exitCallback = (err2) => {
          if (err2.code !== "commander.executeSubCommandAsync") {
            throw err2;
          } else {}
        };
      }
      return this;
    }
    _exit(exitCode, code, message) {
      if (this._exitCallback) {
        this._exitCallback(new CommanderError(exitCode, code, message));
      }
      process2.exit(exitCode);
    }
    action(fn) {
      const listener = (args2) => {
        const expectedArgsCount = this.registeredArguments.length;
        const actionArgs = args2.slice(0, expectedArgsCount);
        if (this._storeOptionsAsProperties) {
          actionArgs[expectedArgsCount] = this;
        } else {
          actionArgs[expectedArgsCount] = this.opts();
        }
        actionArgs.push(this);
        return fn.apply(this, actionArgs);
      };
      this._actionHandler = listener;
      return this;
    }
    createOption(flags2, description) {
      return new Option(flags2, description);
    }
    _callParseArg(target, value, previous, invalidArgumentMessage) {
      try {
        return target.parseArg(value, previous);
      } catch (err2) {
        if (err2.code === "commander.invalidArgument") {
          const message = `${invalidArgumentMessage} ${err2.message}`;
          this.error(message, { exitCode: err2.exitCode, code: err2.code });
        }
        throw err2;
      }
    }
    _registerOption(option) {
      const matchingOption = option.short && this._findOption(option.short) || option.long && this._findOption(option.long);
      if (matchingOption) {
        const matchingFlag = option.long && this._findOption(option.long) ? option.long : option.short;
        throw new Error(`Cannot add option '${option.flags}'${this._name && ` to command '${this._name}'`} due to conflicting flag '${matchingFlag}'
-  already used by option '${matchingOption.flags}'`);
      }
      this.options.push(option);
    }
    _registerCommand(command) {
      const knownBy = (cmd) => {
        return [cmd.name()].concat(cmd.aliases());
      };
      const alreadyUsed = knownBy(command).find((name2) => this._findCommand(name2));
      if (alreadyUsed) {
        const existingCmd = knownBy(this._findCommand(alreadyUsed)).join("|");
        const newCmd = knownBy(command).join("|");
        throw new Error(`cannot add command '${newCmd}' as already have command '${existingCmd}'`);
      }
      this.commands.push(command);
    }
    addOption(option) {
      this._registerOption(option);
      const oname = option.name();
      const name2 = option.attributeName();
      if (option.negate) {
        const positiveLongFlag = option.long.replace(/^--no-/, "--");
        if (!this._findOption(positiveLongFlag)) {
          this.setOptionValueWithSource(name2, option.defaultValue === undefined ? true : option.defaultValue, "default");
        }
      } else if (option.defaultValue !== undefined) {
        this.setOptionValueWithSource(name2, option.defaultValue, "default");
      }
      const handleOptionValue = (val, invalidValueMessage, valueSource) => {
        if (val == null && option.presetArg !== undefined) {
          val = option.presetArg;
        }
        const oldValue = this.getOptionValue(name2);
        if (val !== null && option.parseArg) {
          val = this._callParseArg(option, val, oldValue, invalidValueMessage);
        } else if (val !== null && option.variadic) {
          val = option._concatValue(val, oldValue);
        }
        if (val == null) {
          if (option.negate) {
            val = false;
          } else if (option.isBoolean() || option.optional) {
            val = true;
          } else {
            val = "";
          }
        }
        this.setOptionValueWithSource(name2, val, valueSource);
      };
      this.on("option:" + oname, (val) => {
        const invalidValueMessage = `error: option '${option.flags}' argument '${val}' is invalid.`;
        handleOptionValue(val, invalidValueMessage, "cli");
      });
      if (option.envVar) {
        this.on("optionEnv:" + oname, (val) => {
          const invalidValueMessage = `error: option '${option.flags}' value '${val}' from env '${option.envVar}' is invalid.`;
          handleOptionValue(val, invalidValueMessage, "env");
        });
      }
      return this;
    }
    _optionEx(config, flags2, description, fn, defaultValue) {
      if (typeof flags2 === "object" && flags2 instanceof Option) {
        throw new Error("To add an Option object use addOption() instead of option() or requiredOption()");
      }
      const option = this.createOption(flags2, description);
      option.makeOptionMandatory(!!config.mandatory);
      if (typeof fn === "function") {
        option.default(defaultValue).argParser(fn);
      } else if (fn instanceof RegExp) {
        const regex = fn;
        fn = (val, def) => {
          const m = regex.exec(val);
          return m ? m[0] : def;
        };
        option.default(defaultValue).argParser(fn);
      } else {
        option.default(fn);
      }
      return this.addOption(option);
    }
    option(flags2, description, parseArg, defaultValue) {
      return this._optionEx({}, flags2, description, parseArg, defaultValue);
    }
    requiredOption(flags2, description, parseArg, defaultValue) {
      return this._optionEx({ mandatory: true }, flags2, description, parseArg, defaultValue);
    }
    combineFlagAndOptionalValue(combine = true) {
      this._combineFlagAndOptionalValue = !!combine;
      return this;
    }
    allowUnknownOption(allowUnknown = true) {
      this._allowUnknownOption = !!allowUnknown;
      return this;
    }
    allowExcessArguments(allowExcess = true) {
      this._allowExcessArguments = !!allowExcess;
      return this;
    }
    enablePositionalOptions(positional = true) {
      this._enablePositionalOptions = !!positional;
      return this;
    }
    passThroughOptions(passThrough = true) {
      this._passThroughOptions = !!passThrough;
      this._checkForBrokenPassThrough();
      return this;
    }
    _checkForBrokenPassThrough() {
      if (this.parent && this._passThroughOptions && !this.parent._enablePositionalOptions) {
        throw new Error(`passThroughOptions cannot be used for '${this._name}' without turning on enablePositionalOptions for parent command(s)`);
      }
    }
    storeOptionsAsProperties(storeAsProperties = true) {
      if (this.options.length) {
        throw new Error("call .storeOptionsAsProperties() before adding options");
      }
      if (Object.keys(this._optionValues).length) {
        throw new Error("call .storeOptionsAsProperties() before setting option values");
      }
      this._storeOptionsAsProperties = !!storeAsProperties;
      return this;
    }
    getOptionValue(key) {
      if (this._storeOptionsAsProperties) {
        return this[key];
      }
      return this._optionValues[key];
    }
    setOptionValue(key, value) {
      return this.setOptionValueWithSource(key, value, undefined);
    }
    setOptionValueWithSource(key, value, source) {
      if (this._storeOptionsAsProperties) {
        this[key] = value;
      } else {
        this._optionValues[key] = value;
      }
      this._optionValueSources[key] = source;
      return this;
    }
    getOptionValueSource(key) {
      return this._optionValueSources[key];
    }
    getOptionValueSourceWithGlobals(key) {
      let source;
      this._getCommandAndAncestors().forEach((cmd) => {
        if (cmd.getOptionValueSource(key) !== undefined) {
          source = cmd.getOptionValueSource(key);
        }
      });
      return source;
    }
    _prepareUserArgs(argv, parseOptions) {
      if (argv !== undefined && !Array.isArray(argv)) {
        throw new Error("first parameter to parse must be array or undefined");
      }
      parseOptions = parseOptions || {};
      if (argv === undefined && parseOptions.from === undefined) {
        if (process2.versions?.electron) {
          parseOptions.from = "electron";
        }
        const execArgv = process2.execArgv ?? [];
        if (execArgv.includes("-e") || execArgv.includes("--eval") || execArgv.includes("-p") || execArgv.includes("--print")) {
          parseOptions.from = "eval";
        }
      }
      if (argv === undefined) {
        argv = process2.argv;
      }
      this.rawArgs = argv.slice();
      let userArgs;
      switch (parseOptions.from) {
        case undefined:
        case "node":
          this._scriptPath = argv[1];
          userArgs = argv.slice(2);
          break;
        case "electron":
          if (process2.defaultApp) {
            this._scriptPath = argv[1];
            userArgs = argv.slice(2);
          } else {
            userArgs = argv.slice(1);
          }
          break;
        case "user":
          userArgs = argv.slice(0);
          break;
        case "eval":
          userArgs = argv.slice(1);
          break;
        default:
          throw new Error(`unexpected parse option { from: '${parseOptions.from}' }`);
      }
      if (!this._name && this._scriptPath)
        this.nameFromFilename(this._scriptPath);
      this._name = this._name || "program";
      return userArgs;
    }
    parse(argv, parseOptions) {
      const userArgs = this._prepareUserArgs(argv, parseOptions);
      this._parseCommand([], userArgs);
      return this;
    }
    async parseAsync(argv, parseOptions) {
      const userArgs = this._prepareUserArgs(argv, parseOptions);
      await this._parseCommand([], userArgs);
      return this;
    }
    _executeSubCommand(subcommand, args2) {
      args2 = args2.slice();
      let launchWithNode = false;
      const sourceExt = [".js", ".ts", ".tsx", ".mjs", ".cjs"];
      function findFile(baseDir, baseName) {
        const localBin = path.resolve(baseDir, baseName);
        if (fs2.existsSync(localBin))
          return localBin;
        if (sourceExt.includes(path.extname(baseName)))
          return;
        const foundExt = sourceExt.find((ext) => fs2.existsSync(`${localBin}${ext}`));
        if (foundExt)
          return `${localBin}${foundExt}`;
        return;
      }
      this._checkForMissingMandatoryOptions();
      this._checkForConflictingOptions();
      let executableFile = subcommand._executableFile || `${this._name}-${subcommand._name}`;
      let executableDir = this._executableDir || "";
      if (this._scriptPath) {
        let resolvedScriptPath;
        try {
          resolvedScriptPath = fs2.realpathSync(this._scriptPath);
        } catch (err2) {
          resolvedScriptPath = this._scriptPath;
        }
        executableDir = path.resolve(path.dirname(resolvedScriptPath), executableDir);
      }
      if (executableDir) {
        let localFile = findFile(executableDir, executableFile);
        if (!localFile && !subcommand._executableFile && this._scriptPath) {
          const legacyName = path.basename(this._scriptPath, path.extname(this._scriptPath));
          if (legacyName !== this._name) {
            localFile = findFile(executableDir, `${legacyName}-${subcommand._name}`);
          }
        }
        executableFile = localFile || executableFile;
      }
      launchWithNode = sourceExt.includes(path.extname(executableFile));
      let proc;
      if (process2.platform !== "win32") {
        if (launchWithNode) {
          args2.unshift(executableFile);
          args2 = incrementNodeInspectorPort(process2.execArgv).concat(args2);
          proc = childProcess.spawn(process2.argv[0], args2, { stdio: "inherit" });
        } else {
          proc = childProcess.spawn(executableFile, args2, { stdio: "inherit" });
        }
      } else {
        args2.unshift(executableFile);
        args2 = incrementNodeInspectorPort(process2.execArgv).concat(args2);
        proc = childProcess.spawn(process2.execPath, args2, { stdio: "inherit" });
      }
      if (!proc.killed) {
        const signals = ["SIGUSR1", "SIGUSR2", "SIGTERM", "SIGINT", "SIGHUP"];
        signals.forEach((signal) => {
          process2.on(signal, () => {
            if (proc.killed === false && proc.exitCode === null) {
              proc.kill(signal);
            }
          });
        });
      }
      const exitCallback = this._exitCallback;
      proc.on("close", (code) => {
        code = code ?? 1;
        if (!exitCallback) {
          process2.exit(code);
        } else {
          exitCallback(new CommanderError(code, "commander.executeSubCommandAsync", "(close)"));
        }
      });
      proc.on("error", (err2) => {
        if (err2.code === "ENOENT") {
          const executableDirMessage = executableDir ? `searched for local subcommand relative to directory '${executableDir}'` : "no directory for search for local subcommand, use .executableDir() to supply a custom directory";
          const executableMissing = `'${executableFile}' does not exist
 - if '${subcommand._name}' is not meant to be an executable command, remove description parameter from '.command()' and use '.description()' instead
 - if the default executable name is not suitable, use the executableFile option to supply a custom name or path
 - ${executableDirMessage}`;
          throw new Error(executableMissing);
        } else if (err2.code === "EACCES") {
          throw new Error(`'${executableFile}' not executable`);
        }
        if (!exitCallback) {
          process2.exit(1);
        } else {
          const wrappedError = new CommanderError(1, "commander.executeSubCommandAsync", "(error)");
          wrappedError.nestedError = err2;
          exitCallback(wrappedError);
        }
      });
      this.runningCommand = proc;
    }
    _dispatchSubcommand(commandName, operands, unknown) {
      const subCommand = this._findCommand(commandName);
      if (!subCommand)
        this.help({ error: true });
      let promiseChain;
      promiseChain = this._chainOrCallSubCommandHook(promiseChain, subCommand, "preSubcommand");
      promiseChain = this._chainOrCall(promiseChain, () => {
        if (subCommand._executableHandler) {
          this._executeSubCommand(subCommand, operands.concat(unknown));
        } else {
          return subCommand._parseCommand(operands, unknown);
        }
      });
      return promiseChain;
    }
    _dispatchHelpCommand(subcommandName) {
      if (!subcommandName) {
        this.help();
      }
      const subCommand = this._findCommand(subcommandName);
      if (subCommand && !subCommand._executableHandler) {
        subCommand.help();
      }
      return this._dispatchSubcommand(subcommandName, [], [this._getHelpOption()?.long ?? this._getHelpOption()?.short ?? "--help"]);
    }
    _checkNumberOfArguments() {
      this.registeredArguments.forEach((arg, i2) => {
        if (arg.required && this.args[i2] == null) {
          this.missingArgument(arg.name());
        }
      });
      if (this.registeredArguments.length > 0 && this.registeredArguments[this.registeredArguments.length - 1].variadic) {
        return;
      }
      if (this.args.length > this.registeredArguments.length) {
        this._excessArguments(this.args);
      }
    }
    _processArguments() {
      const myParseArg = (argument, value, previous) => {
        let parsedValue = value;
        if (value !== null && argument.parseArg) {
          const invalidValueMessage = `error: command-argument value '${value}' is invalid for argument '${argument.name()}'.`;
          parsedValue = this._callParseArg(argument, value, previous, invalidValueMessage);
        }
        return parsedValue;
      };
      this._checkNumberOfArguments();
      const processedArgs = [];
      this.registeredArguments.forEach((declaredArg, index) => {
        let value = declaredArg.defaultValue;
        if (declaredArg.variadic) {
          if (index < this.args.length) {
            value = this.args.slice(index);
            if (declaredArg.parseArg) {
              value = value.reduce((processed, v) => {
                return myParseArg(declaredArg, v, processed);
              }, declaredArg.defaultValue);
            }
          } else if (value === undefined) {
            value = [];
          }
        } else if (index < this.args.length) {
          value = this.args[index];
          if (declaredArg.parseArg) {
            value = myParseArg(declaredArg, value, declaredArg.defaultValue);
          }
        }
        processedArgs[index] = value;
      });
      this.processedArgs = processedArgs;
    }
    _chainOrCall(promise, fn) {
      if (promise && promise.then && typeof promise.then === "function") {
        return promise.then(() => fn());
      }
      return fn();
    }
    _chainOrCallHooks(promise, event) {
      let result = promise;
      const hooks = [];
      this._getCommandAndAncestors().reverse().filter((cmd) => cmd._lifeCycleHooks[event] !== undefined).forEach((hookedCommand) => {
        hookedCommand._lifeCycleHooks[event].forEach((callback) => {
          hooks.push({ hookedCommand, callback });
        });
      });
      if (event === "postAction") {
        hooks.reverse();
      }
      hooks.forEach((hookDetail) => {
        result = this._chainOrCall(result, () => {
          return hookDetail.callback(hookDetail.hookedCommand, this);
        });
      });
      return result;
    }
    _chainOrCallSubCommandHook(promise, subCommand, event) {
      let result = promise;
      if (this._lifeCycleHooks[event] !== undefined) {
        this._lifeCycleHooks[event].forEach((hook) => {
          result = this._chainOrCall(result, () => {
            return hook(this, subCommand);
          });
        });
      }
      return result;
    }
    _parseCommand(operands, unknown) {
      const parsed = this.parseOptions(unknown);
      this._parseOptionsEnv();
      this._parseOptionsImplied();
      operands = operands.concat(parsed.operands);
      unknown = parsed.unknown;
      this.args = operands.concat(unknown);
      if (operands && this._findCommand(operands[0])) {
        return this._dispatchSubcommand(operands[0], operands.slice(1), unknown);
      }
      if (this._getHelpCommand() && operands[0] === this._getHelpCommand().name()) {
        return this._dispatchHelpCommand(operands[1]);
      }
      if (this._defaultCommandName) {
        this._outputHelpIfRequested(unknown);
        return this._dispatchSubcommand(this._defaultCommandName, operands, unknown);
      }
      if (this.commands.length && this.args.length === 0 && !this._actionHandler && !this._defaultCommandName) {
        this.help({ error: true });
      }
      this._outputHelpIfRequested(parsed.unknown);
      this._checkForMissingMandatoryOptions();
      this._checkForConflictingOptions();
      const checkForUnknownOptions = () => {
        if (parsed.unknown.length > 0) {
          this.unknownOption(parsed.unknown[0]);
        }
      };
      const commandEvent = `command:${this.name()}`;
      if (this._actionHandler) {
        checkForUnknownOptions();
        this._processArguments();
        let promiseChain;
        promiseChain = this._chainOrCallHooks(promiseChain, "preAction");
        promiseChain = this._chainOrCall(promiseChain, () => this._actionHandler(this.processedArgs));
        if (this.parent) {
          promiseChain = this._chainOrCall(promiseChain, () => {
            this.parent.emit(commandEvent, operands, unknown);
          });
        }
        promiseChain = this._chainOrCallHooks(promiseChain, "postAction");
        return promiseChain;
      }
      if (this.parent && this.parent.listenerCount(commandEvent)) {
        checkForUnknownOptions();
        this._processArguments();
        this.parent.emit(commandEvent, operands, unknown);
      } else if (operands.length) {
        if (this._findCommand("*")) {
          return this._dispatchSubcommand("*", operands, unknown);
        }
        if (this.listenerCount("command:*")) {
          this.emit("command:*", operands, unknown);
        } else if (this.commands.length) {
          this.unknownCommand();
        } else {
          checkForUnknownOptions();
          this._processArguments();
        }
      } else if (this.commands.length) {
        checkForUnknownOptions();
        this.help({ error: true });
      } else {
        checkForUnknownOptions();
        this._processArguments();
      }
    }
    _findCommand(name2) {
      if (!name2)
        return;
      return this.commands.find((cmd) => cmd._name === name2 || cmd._aliases.includes(name2));
    }
    _findOption(arg) {
      return this.options.find((option) => option.is(arg));
    }
    _checkForMissingMandatoryOptions() {
      this._getCommandAndAncestors().forEach((cmd) => {
        cmd.options.forEach((anOption) => {
          if (anOption.mandatory && cmd.getOptionValue(anOption.attributeName()) === undefined) {
            cmd.missingMandatoryOptionValue(anOption);
          }
        });
      });
    }
    _checkForConflictingLocalOptions() {
      const definedNonDefaultOptions = this.options.filter((option) => {
        const optionKey = option.attributeName();
        if (this.getOptionValue(optionKey) === undefined) {
          return false;
        }
        return this.getOptionValueSource(optionKey) !== "default";
      });
      const optionsWithConflicting = definedNonDefaultOptions.filter((option) => option.conflictsWith.length > 0);
      optionsWithConflicting.forEach((option) => {
        const conflictingAndDefined = definedNonDefaultOptions.find((defined) => option.conflictsWith.includes(defined.attributeName()));
        if (conflictingAndDefined) {
          this._conflictingOption(option, conflictingAndDefined);
        }
      });
    }
    _checkForConflictingOptions() {
      this._getCommandAndAncestors().forEach((cmd) => {
        cmd._checkForConflictingLocalOptions();
      });
    }
    parseOptions(argv) {
      const operands = [];
      const unknown = [];
      let dest = operands;
      const args2 = argv.slice();
      function maybeOption(arg) {
        return arg.length > 1 && arg[0] === "-";
      }
      let activeVariadicOption = null;
      while (args2.length) {
        const arg = args2.shift();
        if (arg === "--") {
          if (dest === unknown)
            dest.push(arg);
          dest.push(...args2);
          break;
        }
        if (activeVariadicOption && !maybeOption(arg)) {
          this.emit(`option:${activeVariadicOption.name()}`, arg);
          continue;
        }
        activeVariadicOption = null;
        if (maybeOption(arg)) {
          const option = this._findOption(arg);
          if (option) {
            if (option.required) {
              const value = args2.shift();
              if (value === undefined)
                this.optionMissingArgument(option);
              this.emit(`option:${option.name()}`, value);
            } else if (option.optional) {
              let value = null;
              if (args2.length > 0 && !maybeOption(args2[0])) {
                value = args2.shift();
              }
              this.emit(`option:${option.name()}`, value);
            } else {
              this.emit(`option:${option.name()}`);
            }
            activeVariadicOption = option.variadic ? option : null;
            continue;
          }
        }
        if (arg.length > 2 && arg[0] === "-" && arg[1] !== "-") {
          const option = this._findOption(`-${arg[1]}`);
          if (option) {
            if (option.required || option.optional && this._combineFlagAndOptionalValue) {
              this.emit(`option:${option.name()}`, arg.slice(2));
            } else {
              this.emit(`option:${option.name()}`);
              args2.unshift(`-${arg.slice(2)}`);
            }
            continue;
          }
        }
        if (/^--[^=]+=/.test(arg)) {
          const index = arg.indexOf("=");
          const option = this._findOption(arg.slice(0, index));
          if (option && (option.required || option.optional)) {
            this.emit(`option:${option.name()}`, arg.slice(index + 1));
            continue;
          }
        }
        if (maybeOption(arg)) {
          dest = unknown;
        }
        if ((this._enablePositionalOptions || this._passThroughOptions) && operands.length === 0 && unknown.length === 0) {
          if (this._findCommand(arg)) {
            operands.push(arg);
            if (args2.length > 0)
              unknown.push(...args2);
            break;
          } else if (this._getHelpCommand() && arg === this._getHelpCommand().name()) {
            operands.push(arg);
            if (args2.length > 0)
              operands.push(...args2);
            break;
          } else if (this._defaultCommandName) {
            unknown.push(arg);
            if (args2.length > 0)
              unknown.push(...args2);
            break;
          }
        }
        if (this._passThroughOptions) {
          dest.push(arg);
          if (args2.length > 0)
            dest.push(...args2);
          break;
        }
        dest.push(arg);
      }
      return { operands, unknown };
    }
    opts() {
      if (this._storeOptionsAsProperties) {
        const result = {};
        const len = this.options.length;
        for (let i2 = 0;i2 < len; i2++) {
          const key = this.options[i2].attributeName();
          result[key] = key === this._versionOptionName ? this._version : this[key];
        }
        return result;
      }
      return this._optionValues;
    }
    optsWithGlobals() {
      return this._getCommandAndAncestors().reduce((combinedOptions, cmd) => Object.assign(combinedOptions, cmd.opts()), {});
    }
    error(message, errorOptions) {
      this._outputConfiguration.outputError(`${message}
`, this._outputConfiguration.writeErr);
      if (typeof this._showHelpAfterError === "string") {
        this._outputConfiguration.writeErr(`${this._showHelpAfterError}
`);
      } else if (this._showHelpAfterError) {
        this._outputConfiguration.writeErr(`
`);
        this.outputHelp({ error: true });
      }
      const config = errorOptions || {};
      const exitCode = config.exitCode || 1;
      const code = config.code || "commander.error";
      this._exit(exitCode, code, message);
    }
    _parseOptionsEnv() {
      this.options.forEach((option) => {
        if (option.envVar && option.envVar in process2.env) {
          const optionKey = option.attributeName();
          if (this.getOptionValue(optionKey) === undefined || ["default", "config", "env"].includes(this.getOptionValueSource(optionKey))) {
            if (option.required || option.optional) {
              this.emit(`optionEnv:${option.name()}`, process2.env[option.envVar]);
            } else {
              this.emit(`optionEnv:${option.name()}`);
            }
          }
        }
      });
    }
    _parseOptionsImplied() {
      const dualHelper = new DualOptions(this.options);
      const hasCustomOptionValue = (optionKey) => {
        return this.getOptionValue(optionKey) !== undefined && !["default", "implied"].includes(this.getOptionValueSource(optionKey));
      };
      this.options.filter((option) => option.implied !== undefined && hasCustomOptionValue(option.attributeName()) && dualHelper.valueFromOption(this.getOptionValue(option.attributeName()), option)).forEach((option) => {
        Object.keys(option.implied).filter((impliedKey) => !hasCustomOptionValue(impliedKey)).forEach((impliedKey) => {
          this.setOptionValueWithSource(impliedKey, option.implied[impliedKey], "implied");
        });
      });
    }
    missingArgument(name2) {
      const message = `error: missing required argument '${name2}'`;
      this.error(message, { code: "commander.missingArgument" });
    }
    optionMissingArgument(option) {
      const message = `error: option '${option.flags}' argument missing`;
      this.error(message, { code: "commander.optionMissingArgument" });
    }
    missingMandatoryOptionValue(option) {
      const message = `error: required option '${option.flags}' not specified`;
      this.error(message, { code: "commander.missingMandatoryOptionValue" });
    }
    _conflictingOption(option, conflictingOption) {
      const findBestOptionFromValue = (option2) => {
        const optionKey = option2.attributeName();
        const optionValue = this.getOptionValue(optionKey);
        const negativeOption = this.options.find((target) => target.negate && optionKey === target.attributeName());
        const positiveOption = this.options.find((target) => !target.negate && optionKey === target.attributeName());
        if (negativeOption && (negativeOption.presetArg === undefined && optionValue === false || negativeOption.presetArg !== undefined && optionValue === negativeOption.presetArg)) {
          return negativeOption;
        }
        return positiveOption || option2;
      };
      const getErrorMessage = (option2) => {
        const bestOption = findBestOptionFromValue(option2);
        const optionKey = bestOption.attributeName();
        const source = this.getOptionValueSource(optionKey);
        if (source === "env") {
          return `environment variable '${bestOption.envVar}'`;
        }
        return `option '${bestOption.flags}'`;
      };
      const message = `error: ${getErrorMessage(option)} cannot be used with ${getErrorMessage(conflictingOption)}`;
      this.error(message, { code: "commander.conflictingOption" });
    }
    unknownOption(flag) {
      if (this._allowUnknownOption)
        return;
      let suggestion = "";
      if (flag.startsWith("--") && this._showSuggestionAfterError) {
        let candidateFlags = [];
        let command = this;
        do {
          const moreFlags = command.createHelp().visibleOptions(command).filter((option) => option.long).map((option) => option.long);
          candidateFlags = candidateFlags.concat(moreFlags);
          command = command.parent;
        } while (command && !command._enablePositionalOptions);
        suggestion = suggestSimilar(flag, candidateFlags);
      }
      const message = `error: unknown option '${flag}'${suggestion}`;
      this.error(message, { code: "commander.unknownOption" });
    }
    _excessArguments(receivedArgs) {
      if (this._allowExcessArguments)
        return;
      const expected = this.registeredArguments.length;
      const s = expected === 1 ? "" : "s";
      const forSubcommand = this.parent ? ` for '${this.name()}'` : "";
      const message = `error: too many arguments${forSubcommand}. Expected ${expected} argument${s} but got ${receivedArgs.length}.`;
      this.error(message, { code: "commander.excessArguments" });
    }
    unknownCommand() {
      const unknownName = this.args[0];
      let suggestion = "";
      if (this._showSuggestionAfterError) {
        const candidateNames = [];
        this.createHelp().visibleCommands(this).forEach((command) => {
          candidateNames.push(command.name());
          if (command.alias())
            candidateNames.push(command.alias());
        });
        suggestion = suggestSimilar(unknownName, candidateNames);
      }
      const message = `error: unknown command '${unknownName}'${suggestion}`;
      this.error(message, { code: "commander.unknownCommand" });
    }
    version(str, flags2, description) {
      if (str === undefined)
        return this._version;
      this._version = str;
      flags2 = flags2 || "-V, --version";
      description = description || "output the version number";
      const versionOption = this.createOption(flags2, description);
      this._versionOptionName = versionOption.attributeName();
      this._registerOption(versionOption);
      this.on("option:" + versionOption.name(), () => {
        this._outputConfiguration.writeOut(`${str}
`);
        this._exit(0, "commander.version", str);
      });
      return this;
    }
    description(str, argsDescription) {
      if (str === undefined && argsDescription === undefined)
        return this._description;
      this._description = str;
      if (argsDescription) {
        this._argsDescription = argsDescription;
      }
      return this;
    }
    summary(str) {
      if (str === undefined)
        return this._summary;
      this._summary = str;
      return this;
    }
    alias(alias) {
      if (alias === undefined)
        return this._aliases[0];
      let command = this;
      if (this.commands.length !== 0 && this.commands[this.commands.length - 1]._executableHandler) {
        command = this.commands[this.commands.length - 1];
      }
      if (alias === command._name)
        throw new Error("Command alias can't be the same as its name");
      const matchingCommand = this.parent?._findCommand(alias);
      if (matchingCommand) {
        const existingCmd = [matchingCommand.name()].concat(matchingCommand.aliases()).join("|");
        throw new Error(`cannot add alias '${alias}' to command '${this.name()}' as already have command '${existingCmd}'`);
      }
      command._aliases.push(alias);
      return this;
    }
    aliases(aliases) {
      if (aliases === undefined)
        return this._aliases;
      aliases.forEach((alias) => this.alias(alias));
      return this;
    }
    usage(str) {
      if (str === undefined) {
        if (this._usage)
          return this._usage;
        const args2 = this.registeredArguments.map((arg) => {
          return humanReadableArgName(arg);
        });
        return [].concat(this.options.length || this._helpOption !== null ? "[options]" : [], this.commands.length ? "[command]" : [], this.registeredArguments.length ? args2 : []).join(" ");
      }
      this._usage = str;
      return this;
    }
    name(str) {
      if (str === undefined)
        return this._name;
      this._name = str;
      return this;
    }
    nameFromFilename(filename) {
      this._name = path.basename(filename, path.extname(filename));
      return this;
    }
    executableDir(path2) {
      if (path2 === undefined)
        return this._executableDir;
      this._executableDir = path2;
      return this;
    }
    helpInformation(contextOptions) {
      const helper = this.createHelp();
      if (helper.helpWidth === undefined) {
        helper.helpWidth = contextOptions && contextOptions.error ? this._outputConfiguration.getErrHelpWidth() : this._outputConfiguration.getOutHelpWidth();
      }
      return helper.formatHelp(this, helper);
    }
    _getHelpContext(contextOptions) {
      contextOptions = contextOptions || {};
      const context = { error: !!contextOptions.error };
      let write;
      if (context.error) {
        write = (arg) => this._outputConfiguration.writeErr(arg);
      } else {
        write = (arg) => this._outputConfiguration.writeOut(arg);
      }
      context.write = contextOptions.write || write;
      context.command = this;
      return context;
    }
    outputHelp(contextOptions) {
      let deprecatedCallback;
      if (typeof contextOptions === "function") {
        deprecatedCallback = contextOptions;
        contextOptions = undefined;
      }
      const context = this._getHelpContext(contextOptions);
      this._getCommandAndAncestors().reverse().forEach((command) => command.emit("beforeAllHelp", context));
      this.emit("beforeHelp", context);
      let helpInformation = this.helpInformation(context);
      if (deprecatedCallback) {
        helpInformation = deprecatedCallback(helpInformation);
        if (typeof helpInformation !== "string" && !Buffer.isBuffer(helpInformation)) {
          throw new Error("outputHelp callback must return a string or a Buffer");
        }
      }
      context.write(helpInformation);
      if (this._getHelpOption()?.long) {
        this.emit(this._getHelpOption().long);
      }
      this.emit("afterHelp", context);
      this._getCommandAndAncestors().forEach((command) => command.emit("afterAllHelp", context));
    }
    helpOption(flags2, description) {
      if (typeof flags2 === "boolean") {
        if (flags2) {
          this._helpOption = this._helpOption ?? undefined;
        } else {
          this._helpOption = null;
        }
        return this;
      }
      flags2 = flags2 ?? "-h, --help";
      description = description ?? "display help for command";
      this._helpOption = this.createOption(flags2, description);
      return this;
    }
    _getHelpOption() {
      if (this._helpOption === undefined) {
        this.helpOption(undefined, undefined);
      }
      return this._helpOption;
    }
    addHelpOption(option) {
      this._helpOption = option;
      return this;
    }
    help(contextOptions) {
      this.outputHelp(contextOptions);
      let exitCode = process2.exitCode || 0;
      if (exitCode === 0 && contextOptions && typeof contextOptions !== "function" && contextOptions.error) {
        exitCode = 1;
      }
      this._exit(exitCode, "commander.help", "(outputHelp)");
    }
    addHelpText(position, text) {
      const allowedValues = ["beforeAll", "before", "after", "afterAll"];
      if (!allowedValues.includes(position)) {
        throw new Error(`Unexpected value for position to addHelpText.
Expecting one of '${allowedValues.join("', '")}'`);
      }
      const helpEvent = `${position}Help`;
      this.on(helpEvent, (context) => {
        let helpStr;
        if (typeof text === "function") {
          helpStr = text({ error: context.error, command: context.command });
        } else {
          helpStr = text;
        }
        if (helpStr) {
          context.write(`${helpStr}
`);
        }
      });
      return this;
    }
    _outputHelpIfRequested(args2) {
      const helpOption = this._getHelpOption();
      const helpRequested = helpOption && args2.find((arg) => helpOption.is(arg));
      if (helpRequested) {
        this.outputHelp();
        this._exit(0, "commander.helpDisplayed", "(outputHelp)");
      }
    }
  }
  function incrementNodeInspectorPort(args2) {
    return args2.map((arg) => {
      if (!arg.startsWith("--inspect")) {
        return arg;
      }
      let debugOption;
      let debugHost = "127.0.0.1";
      let debugPort = "9229";
      let match;
      if ((match = arg.match(/^(--inspect(-brk)?)$/)) !== null) {
        debugOption = match[1];
      } else if ((match = arg.match(/^(--inspect(-brk|-port)?)=([^:]+)$/)) !== null) {
        debugOption = match[1];
        if (/^\d+$/.test(match[3])) {
          debugPort = match[3];
        } else {
          debugHost = match[3];
        }
      } else if ((match = arg.match(/^(--inspect(-brk|-port)?)=([^:]+):(\d+)$/)) !== null) {
        debugOption = match[1];
        debugHost = match[3];
        debugPort = match[4];
      }
      if (debugOption && debugPort !== "0") {
        return `${debugOption}=${debugHost}:${parseInt(debugPort) + 1}`;
      }
      return arg;
    });
  }
  exports.Command = Command;
});

// node_modules/commander/index.js
var require_commander = __commonJS((exports) => {
  var { Argument } = require_argument();
  var { Command } = require_command();
  var { CommanderError, InvalidArgumentError } = require_error();
  var { Help } = require_help();
  var { Option } = require_option();
  exports.program = new Command;
  exports.createCommand = (name2) => new Command(name2);
  exports.createOption = (flags2, description) => new Option(flags2, description);
  exports.createArgument = (name2, description) => new Argument(name2, description);
  exports.Command = Command;
  exports.Option = Option;
  exports.Argument = Argument;
  exports.Help = Help;
  exports.CommanderError = CommanderError;
  exports.InvalidArgumentError = InvalidArgumentError;
  exports.InvalidOptionArgumentError = InvalidArgumentError;
});

// node_modules/@electric-sql/pglite/dist/chunk-QY3QWFKW.js
var p, i2, c, f, l, s, a = (t) => {
  throw TypeError(t);
}, _ = (t, e, o) => (e in t) ? i2(t, e, { enumerable: true, configurable: true, writable: true, value: o }) : t[e] = o, d = (t, e) => () => (t && (e = t(t = 0)), e), D = (t, e) => () => (e || t((e = { exports: {} }).exports, e), e.exports), F = (t, e) => {
  for (var o in e)
    i2(t, o, { get: e[o], enumerable: true });
}, g = (t, e, o, m) => {
  if (e && typeof e == "object" || typeof e == "function")
    for (let r of f(e))
      !s.call(t, r) && r !== o && i2(t, r, { get: () => e[r], enumerable: !(m = c(e, r)) || m.enumerable });
  return t;
}, L = (t, e, o) => (o = t != null ? p(l(t)) : {}, g(e || !t || !t.__esModule ? i2(o, "default", { value: t, enumerable: true }) : o, t)), P = (t, e, o) => _(t, typeof e != "symbol" ? e + "" : e, o), n = (t, e, o) => e.has(t) || a("Cannot " + o), h = (t, e, o) => (n(t, e, "read from private field"), o ? o.call(t) : e.get(t)), R = (t, e, o) => e.has(t) ? a("Cannot add the same private member more than once") : e instanceof WeakSet ? e.add(t) : e.set(t, o), x = (t, e, o, m) => (n(t, e, "write to private field"), m ? m.call(t, o) : e.set(t, o), o), T = (t, e, o) => (n(t, e, "access private method"), o), U = (t, e, o, m) => ({ set _(r) {
  x(t, e, r, o);
}, get _() {
  return h(t, e, m);
} }), u;
var init_chunk_QY3QWFKW = __esm(() => {
  p = Object.create;
  i2 = Object.defineProperty;
  c = Object.getOwnPropertyDescriptor;
  f = Object.getOwnPropertyNames;
  l = Object.getPrototypeOf;
  s = Object.prototype.hasOwnProperty;
  u = d(() => {});
});

// node_modules/@electric-sql/pglite/dist/chunk-3WWIVTCY.js
function ue(e, t, n2) {
  if (e === null)
    return null;
  let r = n2?.[t] ?? Se.parsers[t];
  return r ? r(e, t) : e;
}
function pn(e) {
  return Object.keys(e).reduce(({ parsers: t, serializers: n2 }, r) => {
    let { to: i3, from: a2, serialize: u2, parse: f2 } = e[r];
    return n2[i3] = u2, n2[r] = u2, t[r] = f2, Array.isArray(a2) ? a2.forEach((c2) => {
      t[c2] = f2, n2[c2] = u2;
    }) : (t[a2] = f2, n2[a2] = u2), { parsers: t, serializers: n2 };
  }, { parsers: {}, serializers: {} });
}
function mn(e) {
  return e.replace(dn, "\\\\").replace(fn, "\\\"");
}
function Ke(e, t, n2) {
  if (Array.isArray(e) === false)
    return e;
  if (!e.length)
    return "{}";
  let r = e[0], i3 = n2 === 1020 ? ";" : ",";
  return Array.isArray(r) ? `{${e.map((a2) => Ke(a2, t, n2)).join(i3)}}` : `{${e.map((a2) => (a2 === undefined && (a2 = null), a2 === null ? "null" : '"' + mn(t ? t(a2) : a2.toString()) + '"')).join(i3)}}`;
}
function yn(e, t, n2) {
  return he.i = he.last = 0, Je(he, e, t, n2)[0];
}
function Je(e, t, n2, r) {
  let i3 = [], a2 = r === 1020 ? ";" : ",";
  for (;e.i < t.length; e.i++) {
    if (e.char = t[e.i], e.quoted)
      e.char === "\\" ? e.str += t[++e.i] : e.char === '"' ? (i3.push(n2 ? n2(e.str) : e.str), e.str = "", e.quoted = t[e.i + 1] === '"', e.last = e.i + 2) : e.str += e.char;
    else if (e.char === '"')
      e.quoted = true;
    else if (e.char === "{")
      e.last = ++e.i, i3.push(Je(e, t, n2, r));
    else if (e.char === "}") {
      e.quoted = false, e.last < e.i && i3.push(n2 ? n2(t.slice(e.last, e.i)) : t.slice(e.last, e.i)), e.last = e.i + 1;
      break;
    } else
      e.char === a2 && e.p !== "}" && e.p !== '"' && (i3.push(n2 ? n2(t.slice(e.last, e.i)) : t.slice(e.last, e.i)), e.last = e.i + 1);
    e.p = e.char;
  }
  return e.last < e.i && i3.push(n2 ? n2(t.slice(e.last, e.i + 1)) : t.slice(e.last, e.i + 1)), i3;
}
function bn(e, t, n2, r) {
  let i3 = [], a2 = { rows: [], fields: [] }, u2 = 0, f2 = { ...t, ...n2?.parsers };
  return e.forEach((c2) => {
    switch (c2.name) {
      case "rowDescription": {
        let M = c2;
        a2.fields = M.fields.map((E) => ({ name: E.name, dataTypeID: E.dataTypeID }));
        break;
      }
      case "dataRow": {
        if (!a2)
          break;
        let M = c2;
        n2?.rowMode === "array" ? a2.rows.push(M.fields.map((E, ie) => ue(E, a2.fields[ie].dataTypeID, f2))) : a2.rows.push(Object.fromEntries(M.fields.map((E, ie) => [a2.fields[ie].name, ue(E, a2.fields[ie].dataTypeID, f2)])));
        break;
      }
      case "commandComplete": {
        u2 += gn(c2), i3.push({ ...a2, affectedRows: u2, ...r ? { blob: r } : {} }), a2 = { rows: [], fields: [] };
        break;
      }
    }
  }), i3.length === 0 && i3.push({ affectedRows: 0, rows: [], fields: [] }), i3;
}
function gn(e) {
  let t = e.text.split(" ");
  switch (t[0]) {
    case "INSERT":
      return parseInt(t[2], 10);
    case "UPDATE":
    case "DELETE":
    case "COPY":
    case "MERGE":
      return parseInt(t[1], 10);
    default:
      return 0;
  }
}
function De(e) {
  let t = e.find((n2) => n2.name === "parameterDescription");
  return t ? t.dataTypeIDs : [];
}
function P2(e) {
  let t = e.length;
  for (let n2 = e.length - 1;n2 >= 0; n2--) {
    let r = e.charCodeAt(n2);
    r > 127 && r <= 2047 ? t++ : r > 2047 && r <= 65535 && (t += 2), r >= 56320 && r <= 57343 && n2--;
  }
  return t;
}
async function Rr() {
  if (Fe || se)
    return;
  let e = new URL("./pglite.wasm", import.meta.url);
  se = fetch(e);
}
async function Tr(e, t) {
  if (t || re)
    return { instance: await WebAssembly.instantiate(t || re, e), module: t || re };
  let n2 = new URL("./pglite.wasm", import.meta.url);
  if (Fe) {
    let i3 = await (await import("fs/promises")).readFile(n2), { module: a2, instance: u2 } = await WebAssembly.instantiate(i3, e);
    return re = a2, { instance: u2, module: a2 };
  } else {
    se || (se = fetch(n2));
    let r = await se, { module: i3, instance: a2 } = await WebAssembly.instantiateStreaming(r, e);
    return re = i3, { instance: a2, module: i3 };
  }
}
async function Er() {
  let e = new URL("./pglite.data", import.meta.url);
  return Fe ? (await (await import("fs/promises")).readFile(e)).buffer : (await fetch(e)).arrayBuffer();
}
function Nr(e) {
  let t;
  return e.startsWith('"') && e.endsWith('"') ? t = e.substring(1, e.length - 1) : t = e.toLowerCase(), t;
}
var hn, ht, bt, be = 16, ge = 17, gt = 18, we = 20, ve = 21, Ge = 23, wt = 24, V = 25, je = 26, At = 27, xt = 28, St = 29, Ae = 114, Dt = 142, Bt = 194, It = 210, Mt = 602, Rt = 604, Tt = 650, Qe = 700, We = 701, Et = 702, Ct = 703, Pt = 704, Ut = 718, Nt = 774, Lt = 790, Ot = 829, kt = 869, Vt = 1033, _e = 1042, ze = 1043, He = 1082, Ft = 1083, qe = 1114, xe = 1184, vt = 1186, Gt = 1266, jt = 1560, Qt = 1562, Wt = 1700, _t = 1790, zt = 2202, Ht = 2203, qt = 2204, Yt = 2205, $t = 2206, Kt = 2950, Jt = 2970, Xt = 3220, Zt = 3361, en = 3402, tn = 3614, nn = 3615, rn = 3642, sn = 3734, an = 3769, Ye = 3802, on = 4089, un = 4096, $e, Se, ln, cn, dn, fn, he, wn, Ue, Be, Ie, Me, Re, Te, Ee, Ce, Pe, F2 = class {
  constructor(t) {
    this.length = t;
    this.name = "authenticationOk";
  }
}, v = class {
  constructor(t) {
    this.length = t;
    this.name = "authenticationCleartextPassword";
  }
}, G = class {
  constructor(t, n2) {
    this.length = t;
    this.salt = n2;
    this.name = "authenticationMD5Password";
  }
}, j = class {
  constructor(t, n2) {
    this.length = t;
    this.mechanisms = n2;
    this.name = "authenticationSASL";
  }
}, Q = class {
  constructor(t, n2) {
    this.length = t;
    this.data = n2;
    this.name = "authenticationSASLContinue";
  }
}, W = class {
  constructor(t, n2) {
    this.length = t;
    this.data = n2;
    this.name = "authenticationSASLFinal";
  }
}, C, _2 = class {
  constructor(t, n2) {
    this.length = t;
    this.chunk = n2;
    this.name = "copyData";
  }
}, z = class {
  constructor(t, n2, r, i3) {
    this.length = t;
    this.name = n2;
    this.binary = r;
    this.columnTypes = new Array(i3);
  }
}, H = class {
  constructor(t, n2, r, i3, a2, u2, f2) {
    this.name = t;
    this.tableID = n2;
    this.columnID = r;
    this.dataTypeID = i3;
    this.dataTypeSize = a2;
    this.dataTypeModifier = u2;
    this.format = f2;
  }
}, q = class {
  constructor(t, n2) {
    this.length = t;
    this.fieldCount = n2;
    this.name = "rowDescription";
    this.fields = new Array(this.fieldCount);
  }
}, Y = class {
  constructor(t, n2) {
    this.length = t;
    this.parameterCount = n2;
    this.name = "parameterDescription";
    this.dataTypeIDs = new Array(this.parameterCount);
  }
}, $ = class {
  constructor(t, n2, r) {
    this.length = t;
    this.parameterName = n2;
    this.parameterValue = r;
    this.name = "parameterStatus";
  }
}, K = class {
  constructor(t, n2, r) {
    this.length = t;
    this.processID = n2;
    this.secretKey = r;
    this.name = "backendKeyData";
  }
}, J = class {
  constructor(t, n2, r, i3) {
    this.length = t;
    this.processId = n2;
    this.channel = r;
    this.payload = i3;
    this.name = "notification";
  }
}, X = class {
  constructor(t, n2) {
    this.length = t;
    this.status = n2;
    this.name = "readyForQuery";
  }
}, Z = class {
  constructor(t, n2) {
    this.length = t;
    this.text = n2;
    this.name = "commandComplete";
  }
}, ee = class {
  constructor(t, n2) {
    this.length = t;
    this.fields = n2;
    this.name = "dataRow";
    this.fieldCount = n2.length;
  }
}, te = class {
  constructor(t, n2) {
    this.length = t;
    this.message = n2;
    this.name = "notice";
  }
}, zn, b, g2, N, ce, L2, x2, le, U2, Xe, T2 = class {
  constructor(t = 256) {
    this.size = t;
    R(this, x2);
    R(this, b);
    R(this, g2, 5);
    R(this, N, false);
    R(this, ce, new TextEncoder);
    R(this, L2, 0);
    x(this, b, T(this, x2, le).call(this, t));
  }
  addInt32(t) {
    return T(this, x2, U2).call(this, 4), h(this, b).setInt32(h(this, g2), t, h(this, N)), x(this, g2, h(this, g2) + 4), this;
  }
  addInt16(t) {
    return T(this, x2, U2).call(this, 2), h(this, b).setInt16(h(this, g2), t, h(this, N)), x(this, g2, h(this, g2) + 2), this;
  }
  addCString(t) {
    return t && this.addString(t), T(this, x2, U2).call(this, 1), h(this, b).setUint8(h(this, g2), 0), U(this, g2)._++, this;
  }
  addString(t = "") {
    let n2 = P2(t);
    return T(this, x2, U2).call(this, n2), h(this, ce).encodeInto(t, new Uint8Array(h(this, b).buffer, h(this, g2))), x(this, g2, h(this, g2) + n2), this;
  }
  add(t) {
    return T(this, x2, U2).call(this, t.byteLength), new Uint8Array(h(this, b).buffer).set(new Uint8Array(t), h(this, g2)), x(this, g2, h(this, g2) + t.byteLength), this;
  }
  flush(t) {
    let n2 = T(this, x2, Xe).call(this, t);
    return x(this, g2, 5), x(this, b, T(this, x2, le).call(this, this.size)), new Uint8Array(n2);
  }
}, m, An = (e) => {
  m.addInt16(3).addInt16(0);
  for (let r of Object.keys(e))
    m.addCString(r).addCString(e[r]);
  m.addCString("client_encoding").addCString("UTF8");
  let t = m.addCString("").flush(), n2 = t.byteLength + 4;
  return new T2().addInt32(n2).add(t).flush();
}, xn = () => {
  let e = new DataView(new ArrayBuffer(8));
  return e.setInt32(0, 8, false), e.setInt32(4, 80877103, false), new Uint8Array(e.buffer);
}, Sn = (e) => m.addCString(e).flush(112), Dn = (e, t) => (m.addCString(e).addInt32(P2(t)).addString(t), m.flush(112)), Bn = (e) => m.addString(e).flush(112), In = (e) => m.addCString(e).flush(81), Mn, Rn = (e) => {
  let t = e.name ?? "";
  t.length > 63 && (console.error("Warning! Postgres only supports 63 characters for query names."), console.error("You supplied %s (%s)", t, t.length), console.error("This can cause conflicts and silent errors executing queries"));
  let n2 = m.addCString(t).addCString(e.text).addInt16(e.types?.length ?? 0);
  return e.types?.forEach((r) => n2.addInt32(r)), m.flush(80);
}, O, Tn = (e, t) => {
  for (let n2 = 0;n2 < e.length; n2++) {
    let r = t ? t(e[n2], n2) : e[n2];
    if (r === null)
      m.addInt16(0), O.addInt32(-1);
    else if (r instanceof ArrayBuffer || ArrayBuffer.isView(r)) {
      let i3 = ArrayBuffer.isView(r) ? r.buffer.slice(r.byteOffset, r.byteOffset + r.byteLength) : r;
      m.addInt16(1), O.addInt32(i3.byteLength), O.add(i3);
    } else
      m.addInt16(0), O.addInt32(P2(r)), O.addString(r);
  }
}, En = (e = {}) => {
  let t = e.portal ?? "", n2 = e.statement ?? "", r = e.binary ?? false, i3 = e.values ?? Mn, a2 = i3.length;
  return m.addCString(t).addCString(n2), m.addInt16(a2), Tn(i3, e.valueMapper), m.addInt16(a2), m.add(O.flush()), m.addInt16(r ? 1 : 0), m.flush(66);
}, Cn, Pn = (e) => {
  if (!e || !e.portal && !e.rows)
    return Cn;
  let t = e.portal ?? "", n2 = e.rows ?? 0, r = P2(t), i3 = 4 + r + 1 + 4, a2 = new DataView(new ArrayBuffer(1 + i3));
  return a2.setUint8(0, 69), a2.setInt32(1, i3, false), new TextEncoder().encodeInto(t, new Uint8Array(a2.buffer, 5)), a2.setUint8(r + 5, 0), a2.setUint32(a2.byteLength - 4, n2, false), new Uint8Array(a2.buffer);
}, Un = (e, t) => {
  let n2 = new DataView(new ArrayBuffer(16));
  return n2.setInt32(0, 16, false), n2.setInt16(4, 1234, false), n2.setInt16(6, 5678, false), n2.setInt32(8, e, false), n2.setInt32(12, t, false), new Uint8Array(n2.buffer);
}, Ne = (e, t) => {
  let n2 = new T2;
  return n2.addCString(t), n2.flush(e);
}, Nn, Ln, On = (e) => e.name ? Ne(68, `${e.type}${e.name ?? ""}`) : e.type === "P" ? Nn : Ln, kn = (e) => {
  let t = `${e.type}${e.name ?? ""}`;
  return Ne(67, t);
}, Vn = (e) => m.add(e).flush(100), Fn = (e) => Ne(102, e), pe = (e) => new Uint8Array([e, 0, 0, 0, 4]), vn, Gn, jn, Qn, k, Le, Wn, R2, w, fe, me, ne, de = class {
  constructor(t = 0) {
    R(this, R2, new DataView(Wn));
    R(this, w);
    R(this, fe, "utf-8");
    R(this, me, new TextDecoder(h(this, fe)));
    R(this, ne, false);
    x(this, w, t);
  }
  setBuffer(t, n2) {
    x(this, w, t), x(this, R2, new DataView(n2));
  }
  int16() {
    let t = h(this, R2).getInt16(h(this, w), h(this, ne));
    return x(this, w, h(this, w) + 2), t;
  }
  byte() {
    let t = h(this, R2).getUint8(h(this, w));
    return U(this, w)._++, t;
  }
  int32() {
    let t = h(this, R2).getInt32(h(this, w), h(this, ne));
    return x(this, w, h(this, w) + 4), t;
  }
  string(t) {
    return h(this, me).decode(this.bytes(t));
  }
  cstring() {
    let t = h(this, w), n2 = t;
    for (;h(this, R2).getUint8(n2++) !== 0; )
      ;
    let r = this.string(n2 - t - 1);
    return x(this, w, n2), r;
  }
  bytes(t) {
    let n2 = h(this, R2).buffer.slice(h(this, w), h(this, w) + t);
    return x(this, w, h(this, w) + t), new Uint8Array(n2);
  }
}, Oe = 1, _n = 4, Ze, et, A, S, D2, o, l2, tt, nt, rt, st, it, at, ot, ke, ut, lt, ct, pt, dt, ft, mt, yt, Ve, ye = class {
  constructor() {
    R(this, l2);
    R(this, A, new DataView(et));
    R(this, S, 0);
    R(this, D2, 0);
    R(this, o, new de);
  }
  parse(t, n2) {
    T(this, l2, tt).call(this, ArrayBuffer.isView(t) ? t.buffer.slice(t.byteOffset, t.byteOffset + t.byteLength) : t);
    let r = h(this, D2) + h(this, S), i3 = h(this, D2);
    for (;i3 + Ze <= r; ) {
      let a2 = h(this, A).getUint8(i3), u2 = h(this, A).getUint32(i3 + Oe, false), f2 = Oe + u2;
      if (f2 + i3 <= r && u2 > 0) {
        let c2 = T(this, l2, nt).call(this, i3 + Ze, a2, u2, h(this, A).buffer);
        n2(c2), i3 += f2;
      } else
        break;
    }
    i3 === r ? (x(this, A, new DataView(et)), x(this, S, 0), x(this, D2, 0)) : (x(this, S, r - i3), x(this, D2, i3));
  }
}, Fe, se, re;
var init_chunk_3WWIVTCY = __esm(() => {
  init_chunk_QY3QWFKW();
  hn = {};
  F(hn, { ABSTIME: () => Et, ACLITEM: () => Vt, BIT: () => jt, BOOL: () => be, BPCHAR: () => _e, BYTEA: () => ge, CHAR: () => gt, CID: () => St, CIDR: () => Tt, CIRCLE: () => Ut, DATE: () => He, FLOAT4: () => Qe, FLOAT8: () => We, GTSVECTOR: () => rn, INET: () => kt, INT2: () => ve, INT4: () => Ge, INT8: () => we, INTERVAL: () => vt, JSON: () => Ae, JSONB: () => Ye, MACADDR: () => Ot, MACADDR8: () => Nt, MONEY: () => Lt, NUMERIC: () => Wt, OID: () => je, PATH: () => Mt, PG_DEPENDENCIES: () => en, PG_LSN: () => Xt, PG_NDISTINCT: () => Zt, PG_NODE_TREE: () => Bt, POLYGON: () => Rt, REFCURSOR: () => _t, REGCLASS: () => Yt, REGCONFIG: () => sn, REGDICTIONARY: () => an, REGNAMESPACE: () => on, REGOPER: () => Ht, REGOPERATOR: () => qt, REGPROC: () => wt, REGPROCEDURE: () => zt, REGROLE: () => un, REGTYPE: () => $t, RELTIME: () => Ct, SMGR: () => It, TEXT: () => V, TID: () => At, TIME: () => Ft, TIMESTAMP: () => qe, TIMESTAMPTZ: () => xe, TIMETZ: () => Gt, TINTERVAL: () => Pt, TSQUERY: () => nn, TSVECTOR: () => tn, TXID_SNAPSHOT: () => Jt, UUID: () => Kt, VARBIT: () => Qt, VARCHAR: () => ze, XID: () => xt, XML: () => Dt, arrayParser: () => yn, arraySerializer: () => Ke, parseType: () => ue, parsers: () => ln, serializers: () => cn, types: () => $e });
  u();
  ht = globalThis.JSON.parse;
  bt = globalThis.JSON.stringify;
  $e = { string: { to: V, from: [V, ze, _e], serialize: (e) => {
    if (typeof e == "string")
      return e;
    if (typeof e == "number")
      return e.toString();
    throw new Error("Invalid input for string type");
  }, parse: (e) => e }, number: { to: 0, from: [ve, Ge, je, Qe, We], serialize: (e) => e.toString(), parse: (e) => +e }, bigint: { to: we, from: [we], serialize: (e) => e.toString(), parse: (e) => {
    let t = BigInt(e);
    return t < Number.MIN_SAFE_INTEGER || t > Number.MAX_SAFE_INTEGER ? t : Number(t);
  } }, json: { to: Ae, from: [Ae, Ye], serialize: (e) => typeof e == "string" ? e : bt(e), parse: (e) => ht(e) }, boolean: { to: be, from: [be], serialize: (e) => {
    if (typeof e != "boolean")
      throw new Error("Invalid input for boolean type");
    return e ? "t" : "f";
  }, parse: (e) => e === "t" }, date: { to: xe, from: [He, qe, xe], serialize: (e) => {
    if (typeof e == "string")
      return e;
    if (typeof e == "number")
      return new Date(e).toISOString();
    if (e instanceof Date)
      return e.toISOString();
    throw new Error("Invalid input for date type");
  }, parse: (e) => new Date(e) }, bytea: { to: ge, from: [ge], serialize: (e) => {
    if (!(e instanceof Uint8Array))
      throw new Error("Invalid input for bytea type");
    return "\\x" + Array.from(e).map((t) => t.toString(16).padStart(2, "0")).join("");
  }, parse: (e) => {
    let t = e.slice(2);
    return Uint8Array.from({ length: t.length / 2 }, (n2, r) => parseInt(t.substring(r * 2, (r + 1) * 2), 16));
  } } };
  Se = pn($e);
  ln = Se.parsers;
  cn = Se.serializers;
  dn = /\\/g;
  fn = /"/g;
  he = { i: 0, char: null, str: "", quoted: false, last: 0, p: null };
  wn = {};
  F(wn, { parseDescribeStatementResults: () => De, parseResults: () => bn });
  u();
  Ue = {};
  F(Ue, { AuthenticationCleartextPassword: () => v, AuthenticationMD5Password: () => G, AuthenticationOk: () => F2, AuthenticationSASL: () => j, AuthenticationSASLContinue: () => Q, AuthenticationSASLFinal: () => W, BackendKeyDataMessage: () => K, CommandCompleteMessage: () => Z, CopyDataMessage: () => _2, CopyResponse: () => z, DataRowMessage: () => ee, DatabaseError: () => C, Field: () => H, NoticeMessage: () => te, NotificationResponseMessage: () => J, ParameterDescriptionMessage: () => Y, ParameterStatusMessage: () => $, ReadyForQueryMessage: () => X, RowDescriptionMessage: () => q, bindComplete: () => Ie, closeComplete: () => Me, copyDone: () => Pe, emptyQuery: () => Ce, noData: () => Re, parseComplete: () => Be, portalSuspended: () => Te, replicationStart: () => Ee });
  u();
  Be = { name: "parseComplete", length: 5 };
  Ie = { name: "bindComplete", length: 5 };
  Me = { name: "closeComplete", length: 5 };
  Re = { name: "noData", length: 5 };
  Te = { name: "portalSuspended", length: 5 };
  Ee = { name: "replicationStart", length: 4 };
  Ce = { name: "emptyQuery", length: 4 };
  Pe = { name: "copyDone", length: 4 };
  C = class extends Error {
    constructor(n2, r, i3) {
      super(n2);
      this.length = r;
      this.name = i3;
    }
  };
  zn = {};
  F(zn, { Parser: () => ye, messages: () => Ue, serialize: () => k });
  u();
  u();
  u();
  u();
  b = new WeakMap, g2 = new WeakMap, N = new WeakMap, ce = new WeakMap, L2 = new WeakMap, x2 = new WeakSet, le = function(t) {
    return new DataView(new ArrayBuffer(t));
  }, U2 = function(t) {
    if (h(this, b).byteLength - h(this, g2) < t) {
      let r = h(this, b).buffer, i3 = r.byteLength + (r.byteLength >> 1) + t;
      x(this, b, T(this, x2, le).call(this, i3)), new Uint8Array(h(this, b).buffer).set(new Uint8Array(r));
    }
  }, Xe = function(t) {
    if (t) {
      h(this, b).setUint8(h(this, L2), t);
      let n2 = h(this, g2) - (h(this, L2) + 1);
      h(this, b).setInt32(h(this, L2) + 1, n2, h(this, N));
    }
    return h(this, b).buffer.slice(t ? 0 : 5, h(this, g2));
  };
  m = new T2;
  Mn = [];
  O = new T2;
  Cn = new Uint8Array([69, 0, 0, 0, 9, 0, 0, 0, 0, 0]);
  Nn = m.addCString("P").flush(68);
  Ln = m.addCString("S").flush(68);
  vn = pe(72);
  Gn = pe(83);
  jn = pe(88);
  Qn = pe(99);
  k = { startup: An, password: Sn, requestSsl: xn, sendSASLInitialResponseMessage: Dn, sendSCRAMClientFinalMessage: Bn, query: In, parse: Rn, bind: En, execute: Pn, describe: On, close: kn, flush: () => vn, sync: () => Gn, end: () => jn, copyData: Vn, copyDone: () => Qn, copyFail: Fn, cancel: Un };
  u();
  u();
  Le = { text: 0, binary: 1 };
  u();
  Wn = new ArrayBuffer(0);
  R2 = new WeakMap, w = new WeakMap, fe = new WeakMap, me = new WeakMap, ne = new WeakMap;
  Ze = Oe + _n;
  et = new ArrayBuffer(0);
  A = new WeakMap, S = new WeakMap, D2 = new WeakMap, o = new WeakMap, l2 = new WeakSet, tt = function(t) {
    if (h(this, S) > 0) {
      let n2 = h(this, S) + t.byteLength;
      if (n2 + h(this, D2) > h(this, A).byteLength) {
        let i3;
        if (n2 <= h(this, A).byteLength && h(this, D2) >= h(this, S))
          i3 = h(this, A).buffer;
        else {
          let a2 = h(this, A).byteLength * 2;
          for (;n2 >= a2; )
            a2 *= 2;
          i3 = new ArrayBuffer(a2);
        }
        new Uint8Array(i3).set(new Uint8Array(h(this, A).buffer, h(this, D2), h(this, S))), x(this, A, new DataView(i3)), x(this, D2, 0);
      }
      new Uint8Array(h(this, A).buffer).set(new Uint8Array(t), h(this, D2) + h(this, S)), x(this, S, n2);
    } else
      x(this, A, new DataView(t)), x(this, D2, 0), x(this, S, t.byteLength);
  }, nt = function(t, n2, r, i3) {
    switch (n2) {
      case 50:
        return Ie;
      case 49:
        return Be;
      case 51:
        return Me;
      case 110:
        return Re;
      case 115:
        return Te;
      case 99:
        return Pe;
      case 87:
        return Ee;
      case 73:
        return Ce;
      case 68:
        return T(this, l2, dt).call(this, t, r, i3);
      case 67:
        return T(this, l2, st).call(this, t, r, i3);
      case 90:
        return T(this, l2, rt).call(this, t, r, i3);
      case 65:
        return T(this, l2, ut).call(this, t, r, i3);
      case 82:
        return T(this, l2, yt).call(this, t, r, i3);
      case 83:
        return T(this, l2, ft).call(this, t, r, i3);
      case 75:
        return T(this, l2, mt).call(this, t, r, i3);
      case 69:
        return T(this, l2, Ve).call(this, t, r, i3, "error");
      case 78:
        return T(this, l2, Ve).call(this, t, r, i3, "notice");
      case 84:
        return T(this, l2, lt).call(this, t, r, i3);
      case 116:
        return T(this, l2, pt).call(this, t, r, i3);
      case 71:
        return T(this, l2, at).call(this, t, r, i3);
      case 72:
        return T(this, l2, ot).call(this, t, r, i3);
      case 100:
        return T(this, l2, it).call(this, t, r, i3);
      default:
        return new C("received invalid response: " + n2.toString(16), r, "error");
    }
  }, rt = function(t, n2, r) {
    h(this, o).setBuffer(t, r);
    let i3 = h(this, o).string(1);
    return new X(n2, i3);
  }, st = function(t, n2, r) {
    h(this, o).setBuffer(t, r);
    let i3 = h(this, o).cstring();
    return new Z(n2, i3);
  }, it = function(t, n2, r) {
    let i3 = r.slice(t, t + (n2 - 4));
    return new _2(n2, new Uint8Array(i3));
  }, at = function(t, n2, r) {
    return T(this, l2, ke).call(this, t, n2, r, "copyInResponse");
  }, ot = function(t, n2, r) {
    return T(this, l2, ke).call(this, t, n2, r, "copyOutResponse");
  }, ke = function(t, n2, r, i3) {
    h(this, o).setBuffer(t, r);
    let a2 = h(this, o).byte() !== 0, u2 = h(this, o).int16(), f2 = new z(n2, i3, a2, u2);
    for (let c2 = 0;c2 < u2; c2++)
      f2.columnTypes[c2] = h(this, o).int16();
    return f2;
  }, ut = function(t, n2, r) {
    h(this, o).setBuffer(t, r);
    let i3 = h(this, o).int32(), a2 = h(this, o).cstring(), u2 = h(this, o).cstring();
    return new J(n2, i3, a2, u2);
  }, lt = function(t, n2, r) {
    h(this, o).setBuffer(t, r);
    let i3 = h(this, o).int16(), a2 = new q(n2, i3);
    for (let u2 = 0;u2 < i3; u2++)
      a2.fields[u2] = T(this, l2, ct).call(this);
    return a2;
  }, ct = function() {
    let t = h(this, o).cstring(), n2 = h(this, o).int32(), r = h(this, o).int16(), i3 = h(this, o).int32(), a2 = h(this, o).int16(), u2 = h(this, o).int32(), f2 = h(this, o).int16() === 0 ? Le.text : Le.binary;
    return new H(t, n2, r, i3, a2, u2, f2);
  }, pt = function(t, n2, r) {
    h(this, o).setBuffer(t, r);
    let i3 = h(this, o).int16(), a2 = new Y(n2, i3);
    for (let u2 = 0;u2 < i3; u2++)
      a2.dataTypeIDs[u2] = h(this, o).int32();
    return a2;
  }, dt = function(t, n2, r) {
    h(this, o).setBuffer(t, r);
    let i3 = h(this, o).int16(), a2 = new Array(i3);
    for (let u2 = 0;u2 < i3; u2++) {
      let f2 = h(this, o).int32();
      a2[u2] = f2 === -1 ? null : h(this, o).string(f2);
    }
    return new ee(n2, a2);
  }, ft = function(t, n2, r) {
    h(this, o).setBuffer(t, r);
    let i3 = h(this, o).cstring(), a2 = h(this, o).cstring();
    return new $(n2, i3, a2);
  }, mt = function(t, n2, r) {
    h(this, o).setBuffer(t, r);
    let i3 = h(this, o).int32(), a2 = h(this, o).int32();
    return new K(n2, i3, a2);
  }, yt = function(t, n2, r) {
    h(this, o).setBuffer(t, r);
    let i3 = h(this, o).int32();
    switch (i3) {
      case 0:
        return new F2(n2);
      case 3:
        return new v(n2);
      case 5:
        return new G(n2, h(this, o).bytes(4));
      case 10: {
        let a2 = [];
        for (;; ) {
          let u2 = h(this, o).cstring();
          if (u2.length === 0)
            return new j(n2, a2);
          a2.push(u2);
        }
      }
      case 11:
        return new Q(n2, h(this, o).string(n2 - 8));
      case 12:
        return new W(n2, h(this, o).string(n2 - 8));
      default:
        throw new Error("Unknown authenticationOk message type " + i3);
    }
  }, Ve = function(t, n2, r, i3) {
    h(this, o).setBuffer(t, r);
    let a2 = {}, u2 = h(this, o).string(1);
    for (;u2 !== "\x00"; )
      a2[u2] = h(this, o).cstring(), u2 = h(this, o).string(1);
    let f2 = a2.M, c2 = i3 === "notice" ? new te(n2, f2) : new C(f2, n2, i3);
    return c2.severity = a2.S, c2.code = a2.C, c2.detail = a2.D, c2.hint = a2.H, c2.position = a2.P, c2.internalPosition = a2.p, c2.internalQuery = a2.q, c2.where = a2.W, c2.schema = a2.s, c2.table = a2.t, c2.column = a2.c, c2.dataType = a2.d, c2.constraint = a2.n, c2.file = a2.F, c2.line = a2.L, c2.routine = a2.R, c2;
  };
  u();
  Fe = typeof process == "object" && typeof process.versions == "object" && typeof process.versions.node == "string";
});

// node_modules/@electric-sql/pglite/dist/chunk-F4GETNPB.js
function s2(t, r, ...e) {
  let a2 = t.length - 1, p2 = e.length - 1;
  if (p2 !== -1) {
    if (p2 === 0) {
      t[a2] = t[a2] + e[0] + r;
      return;
    }
    t[a2] = t[a2] + e[0], t.push(...e.slice(1, p2)), t.push(e[p2] + r);
  }
}
function y(t, ...r) {
  let e = [t[0]];
  e.raw = [t.raw[0]];
  let a2 = [];
  for (let p2 = 0;p2 < r.length; p2++) {
    let n2 = r[p2], i3 = p2 + 1;
    if (n2?._templateType === o2.part) {
      s2(e, t[i3], n2.str), s2(e.raw, t.raw[i3], n2.str);
      continue;
    }
    if (n2?._templateType === o2.container) {
      s2(e, t[i3], ...n2.strings), s2(e.raw, t.raw[i3], ...n2.strings.raw), a2.push(...n2.values);
      continue;
    }
    e.push(t[i3]), e.raw.push(t.raw[i3]), a2.push(n2);
  }
  return { _templateType: "container", strings: e, values: a2 };
}
function g3(t, ...r) {
  let { strings: e, values: a2 } = y(t, ...r);
  return { query: [e[0], ...a2.flatMap((p2, n2) => [`$${n2 + 1}`, e[n2 + 1]])].join(""), params: a2 };
}
var o2;
var init_chunk_F4GETNPB = __esm(() => {
  init_chunk_QY3QWFKW();
  u();
  o2 = { part: "part", container: "container" };
});

// node_modules/@electric-sql/pglite/dist/chunk-F2DQ4FIK.js
function E(m2) {
  let s3 = m2.e;
  return s3.query = m2.query, s3.params = m2.params, s3.queryOptions = m2.options, s3;
}
var T3, p2, t, y2, x3, h2, O2, k2 = class {
  constructor() {
    R(this, t);
    this.serializers = { ...cn };
    this.parsers = { ...ln };
    R(this, T3, false);
    R(this, p2, false);
  }
  async _initArrayTypes({ force: s3 = false } = {}) {
    if (h(this, T3) && !s3)
      return;
    x(this, T3, true);
    let e = await this.query(`
      SELECT b.oid, b.typarray
      FROM pg_catalog.pg_type a
      LEFT JOIN pg_catalog.pg_type b ON b.oid = a.typelem
      WHERE a.typcategory = 'A'
      GROUP BY b.oid, b.typarray
      ORDER BY b.oid
    `);
    for (let r of e.rows)
      this.serializers[r.typarray] = (o3) => Ke(o3, this.serializers[r.oid], r.typarray), this.parsers[r.typarray] = (o3) => yn(o3, this.parsers[r.oid], r.typarray);
  }
  async refreshArrayTypes() {
    await this._initArrayTypes({ force: true });
  }
  async query(s3, e, r) {
    return await this._checkReady(), await this._runExclusiveTransaction(async () => await T(this, t, x3).call(this, s3, e, r));
  }
  async sql(s3, ...e) {
    let { query: r, params: o3 } = g3(s3, ...e);
    return await this.query(r, o3);
  }
  async exec(s3, e) {
    return await this._checkReady(), await this._runExclusiveTransaction(async () => await T(this, t, h2).call(this, s3, e));
  }
  async describeQuery(s3, e) {
    let r = [];
    try {
      await T(this, t, y2).call(this, k.parse({ text: s3, types: e?.paramTypes }), e), r = await T(this, t, y2).call(this, k.describe({ type: "S" }), e);
    } catch (n2) {
      throw n2 instanceof C ? E({ e: n2, options: e, params: undefined, query: s3 }) : n2;
    } finally {
      r.push(...await T(this, t, y2).call(this, k.sync(), e));
    }
    let o3 = r.find((n2) => n2.name === "parameterDescription"), i3 = r.find((n2) => n2.name === "rowDescription"), c2 = o3?.dataTypeIDs.map((n2) => ({ dataTypeID: n2, serializer: this.serializers[n2] })) ?? [], u2 = i3?.fields.map((n2) => ({ name: n2.name, dataTypeID: n2.dataTypeID, parser: this.parsers[n2.dataTypeID] })) ?? [];
    return { queryParams: c2, resultFields: u2 };
  }
  async transaction(s3) {
    return await this._checkReady(), await this._runExclusiveTransaction(async () => {
      await T(this, t, h2).call(this, "BEGIN"), x(this, p2, true);
      let e = false, r = () => {
        if (e)
          throw new Error("Transaction is closed");
      }, o3 = { query: async (i3, c2, u2) => (r(), await T(this, t, x3).call(this, i3, c2, u2)), sql: async (i3, ...c2) => {
        let { query: u2, params: n2 } = g3(i3, ...c2);
        return await T(this, t, x3).call(this, u2, n2);
      }, exec: async (i3, c2) => (r(), await T(this, t, h2).call(this, i3, c2)), rollback: async () => {
        r(), await T(this, t, h2).call(this, "ROLLBACK"), e = true;
      }, listen: async (i3, c2) => (r(), await this.listen(i3, c2, o3)), get closed() {
        return e;
      } };
      try {
        let i3 = await s3(o3);
        return e || (e = true, await T(this, t, h2).call(this, "COMMIT")), x(this, p2, false), i3;
      } catch (i3) {
        throw e || await T(this, t, h2).call(this, "ROLLBACK"), x(this, p2, false), i3;
      }
    });
  }
  async runExclusive(s3) {
    return await this._runExclusiveQuery(s3);
  }
};
var init_chunk_F2DQ4FIK = __esm(() => {
  init_chunk_3WWIVTCY();
  init_chunk_F4GETNPB();
  init_chunk_QY3QWFKW();
  u();
  u();
  T3 = new WeakMap, p2 = new WeakMap, t = new WeakSet, y2 = async function(s3, e = {}) {
    return await this.execProtocolStream(s3, { ...e, syncToFs: false });
  }, x3 = async function(s3, e = [], r) {
    return await this._runExclusiveQuery(async () => {
      T(this, t, O2).call(this, "runQuery", s3, e, r), await this._handleBlob(r?.blob);
      let o3 = [];
      try {
        let c2 = await T(this, t, y2).call(this, k.parse({ text: s3, types: r?.paramTypes }), r), u2 = De(await T(this, t, y2).call(this, k.describe({ type: "S" }), r)), n2 = e.map((b2, S2) => {
          let D3 = u2[S2];
          if (b2 == null)
            return null;
          let Q2 = r?.serializers?.[D3] ?? this.serializers[D3];
          return Q2 ? Q2(b2) : b2.toString();
        });
        o3 = [...c2, ...await T(this, t, y2).call(this, k.bind({ values: n2 }), r), ...await T(this, t, y2).call(this, k.describe({ type: "P" }), r), ...await T(this, t, y2).call(this, k.execute({}), r)];
      } catch (c2) {
        throw c2 instanceof C ? E({ e: c2, options: r, params: e, query: s3 }) : c2;
      } finally {
        o3.push(...await T(this, t, y2).call(this, k.sync(), r));
      }
      await this._cleanupBlob(), h(this, p2) || await this.syncToFs();
      let i3 = await this._getWrittenBlob();
      return bn(o3, this.parsers, r, i3)[0];
    });
  }, h2 = async function(s3, e) {
    return await this._runExclusiveQuery(async () => {
      T(this, t, O2).call(this, "runExec", s3, e), await this._handleBlob(e?.blob);
      let r = [];
      try {
        r = await T(this, t, y2).call(this, k.query(s3), e);
      } catch (i3) {
        throw i3 instanceof C ? E({ e: i3, options: e, params: undefined, query: s3 }) : i3;
      } finally {
        r.push(...await T(this, t, y2).call(this, k.sync(), e));
      }
      this._cleanupBlob(), h(this, p2) || await this.syncToFs();
      let o3 = await this._getWrittenBlob();
      return bn(r, this.parsers, e, o3);
    });
  }, O2 = function(...s3) {
    this.debug > 0 && console.log(...s3);
  };
});

// node_modules/@electric-sql/pglite/dist/chunk-VBDAOXYI.js
async function H2(r, e, t2 = "pgdata", s3 = "auto") {
  let a2 = Br(r, e), [n2, o3] = await qr(a2, s3), i3 = t2 + (o3 ? ".tar.gz" : ".tar"), u2 = o3 ? "application/x-gzip" : "application/x-tar";
  return typeof File < "u" ? new File([n2], i3, { type: u2 }) : new Blob([n2], { type: u2 });
}
async function ce2(r, e, t2) {
  let s3 = new Uint8Array(await e.arrayBuffer()), a2 = typeof File < "u" && e instanceof File ? e.name : undefined;
  (Hr.includes(e.type) || a2?.endsWith(".tgz") || a2?.endsWith(".tar.gz")) && (s3 = await ar(s3));
  let o3;
  try {
    o3 = (0, g4.untar)(s3);
  } catch (i3) {
    if (i3 instanceof Error && i3.message.includes("File is corrupted"))
      s3 = await ar(s3), o3 = (0, g4.untar)(s3);
    else
      throw i3;
  }
  for (let i3 of o3) {
    let u2 = t2 + i3.name, c2 = u2.split("/").slice(0, -1);
    for (let m2 = 1;m2 <= c2.length; m2++) {
      let y3 = c2.slice(0, m2).join("/");
      r.analyzePath(y3).exists || r.mkdir(y3);
    }
    i3.type === g4.REGTYPE ? (r.writeFile(u2, i3.data), r.utime(u2, sr(i3.modifyTime), sr(i3.modifyTime))) : i3.type === g4.DIRTYPE && r.mkdir(u2);
  }
}
function jr(r, e) {
  let t2 = [], s3 = (a2) => {
    r.readdir(a2).forEach((o3) => {
      if (o3 === "." || o3 === "..")
        return;
      let i3 = a2 + "/" + o3, u2 = r.stat(i3), c2 = r.isFile(u2.mode) ? r.readFile(i3, { encoding: "binary" }) : new Uint8Array(0);
      t2.push({ name: i3.substring(e.length), mode: u2.mode, size: u2.size, type: r.isFile(u2.mode) ? g4.REGTYPE : g4.DIRTYPE, modifyTime: u2.mtime, data: c2 }), r.isDir(u2.mode) && s3(i3);
    });
  };
  return s3(e), t2;
}
function Br(r, e) {
  let t2 = jr(r, e);
  return (0, g4.tar)(t2);
}
async function qr(r, e = "auto") {
  if (e === "none")
    return [r, false];
  if (typeof CompressionStream < "u")
    return [await Yr(r), true];
  if (typeof process < "u" && process.versions && process.versions.node)
    return [await Wr(r), true];
  if (e === "auto")
    return [r, false];
  throw new Error("Compression not supported in this environment");
}
async function Yr(r) {
  let e = new CompressionStream("gzip"), t2 = e.writable.getWriter(), s3 = e.readable.getReader();
  t2.write(r), t2.close();
  let a2 = [];
  for (;; ) {
    let { value: i3, done: u2 } = await s3.read();
    if (u2)
      break;
    i3 && a2.push(i3);
  }
  let n2 = new Uint8Array(a2.reduce((i3, u2) => i3 + u2.length, 0)), o3 = 0;
  return a2.forEach((i3) => {
    n2.set(i3, o3), o3 += i3.length;
  }), n2;
}
async function Wr(r) {
  let { promisify: e } = await import("util"), { gzip: t2 } = await import("zlib");
  return await e(t2)(r);
}
async function ar(r) {
  if (typeof CompressionStream < "u")
    return await Xr(r);
  if (typeof process < "u" && process.versions && process.versions.node)
    return await Kr(r);
  throw new Error("Unsupported environment for decompression");
}
async function Xr(r) {
  let e = new DecompressionStream("gzip"), t2 = e.writable.getWriter(), s3 = e.readable.getReader();
  t2.write(r), t2.close();
  let a2 = [];
  for (;; ) {
    let { value: i3, done: u2 } = await s3.read();
    if (u2)
      break;
    i3 && a2.push(i3);
  }
  let n2 = new Uint8Array(a2.reduce((i3, u2) => i3 + u2.length, 0)), o3 = 0;
  return a2.forEach((i3) => {
    n2.set(i3, o3), o3 += i3.length;
  }), n2;
}
async function Kr(r) {
  let { promisify: e } = await import("util"), { gunzip: t2 } = await import("zlib");
  return await e(t2)(r);
}
function sr(r) {
  return r ? typeof r == "number" ? r : Math.floor(r.getTime() / 1000) : Math.floor(Date.now() / 1000);
}
var w2, x4, L3, er, nr, or, g4, Hr, Vr = "/tmp/pglite", C2, ur = class {
  constructor(e) {
    this.dataDir = e;
  }
  async init(e, t2) {
    return this.pg = e, { emscriptenOpts: t2 };
  }
  async syncToFs(e) {}
  async initialSyncFs() {}
  async closeFs() {}
  async dumpTar(e, t2) {
    return H2(this.pg.Module.FS, C2, e, t2);
  }
}, cr = class {
  constructor(e, { debug: t2 = false } = {}) {
    this.dataDir = e, this.debug = t2;
  }
  async syncToFs(e) {}
  async initialSyncFs() {}
  async closeFs() {}
  async dumpTar(e, t2) {
    return H2(this.pg.Module.FS, C2, e, t2);
  }
  async init(e, t2) {
    return this.pg = e, { emscriptenOpts: { ...t2, preRun: [...t2.preRun || [], (a2) => {
      let n2 = Zr(a2, this);
      a2.FS.mkdir(C2), a2.FS.mount(n2, {}, C2);
    }] } };
  }
}, pr, Zr = (r, e) => {
  let t2 = r.FS, s3 = e.debug ? console.log : null, a2 = { tryFSOperation(n2) {
    try {
      return n2();
    } catch (o3) {
      throw o3.code ? o3.code === "UNKNOWN" ? new t2.ErrnoError(pr.EINVAL) : new t2.ErrnoError(o3.code) : o3;
    }
  }, mount(n2) {
    return a2.createNode(null, "/", 16895, 0);
  }, syncfs(n2, o3, i3) {}, createNode(n2, o3, i3, u2) {
    if (!t2.isDir(i3) && !t2.isFile(i3))
      throw new t2.ErrnoError(28);
    let c2 = t2.createNode(n2, o3, i3);
    return c2.node_ops = a2.node_ops, c2.stream_ops = a2.stream_ops, c2;
  }, getMode: function(n2) {
    return s3?.("getMode", n2), a2.tryFSOperation(() => e.lstat(n2).mode);
  }, realPath: function(n2) {
    let o3 = [];
    for (;n2.parent !== n2; )
      o3.push(n2.name), n2 = n2.parent;
    return o3.push(n2.mount.opts.root), o3.reverse(), o3.join("/");
  }, node_ops: { getattr(n2) {
    s3?.("getattr", a2.realPath(n2));
    let o3 = a2.realPath(n2);
    return a2.tryFSOperation(() => {
      let i3 = e.lstat(o3);
      return { ...i3, dev: 0, ino: n2.id, nlink: 1, rdev: n2.rdev, atime: new Date(i3.atime), mtime: new Date(i3.mtime), ctime: new Date(i3.ctime) };
    });
  }, setattr(n2, o3) {
    s3?.("setattr", a2.realPath(n2), o3);
    let i3 = a2.realPath(n2);
    a2.tryFSOperation(() => {
      o3.mode !== undefined && e.chmod(i3, o3.mode), o3.size !== undefined && e.truncate(i3, o3.size), o3.timestamp !== undefined && e.utimes(i3, o3.timestamp, o3.timestamp), o3.size !== undefined && e.truncate(i3, o3.size);
    });
  }, lookup(n2, o3) {
    s3?.("lookup", a2.realPath(n2), o3);
    let i3 = [a2.realPath(n2), o3].join("/"), u2 = a2.getMode(i3);
    return a2.createNode(n2, o3, u2);
  }, mknod(n2, o3, i3, u2) {
    s3?.("mknod", a2.realPath(n2), o3, i3, u2);
    let c2 = a2.createNode(n2, o3, i3, u2), m2 = a2.realPath(c2);
    return a2.tryFSOperation(() => (t2.isDir(c2.mode) ? e.mkdir(m2, { mode: i3 }) : e.writeFile(m2, "", { mode: i3 }), c2));
  }, rename(n2, o3, i3) {
    s3?.("rename", a2.realPath(n2), a2.realPath(o3), i3);
    let u2 = a2.realPath(n2), c2 = [a2.realPath(o3), i3].join("/");
    a2.tryFSOperation(() => {
      e.rename(u2, c2);
    }), n2.name = i3;
  }, unlink(n2, o3) {
    s3?.("unlink", a2.realPath(n2), o3);
    let i3 = [a2.realPath(n2), o3].join("/");
    try {
      e.unlink(i3);
    } catch {}
  }, rmdir(n2, o3) {
    s3?.("rmdir", a2.realPath(n2), o3);
    let i3 = [a2.realPath(n2), o3].join("/");
    return a2.tryFSOperation(() => {
      e.rmdir(i3);
    });
  }, readdir(n2) {
    s3?.("readdir", a2.realPath(n2));
    let o3 = a2.realPath(n2);
    return a2.tryFSOperation(() => e.readdir(o3));
  }, symlink(n2, o3, i3) {
    throw s3?.("symlink", a2.realPath(n2), o3, i3), new t2.ErrnoError(63);
  }, readlink(n2) {
    throw s3?.("readlink", a2.realPath(n2)), new t2.ErrnoError(63);
  } }, stream_ops: { open(n2) {
    s3?.("open stream", a2.realPath(n2.node));
    let o3 = a2.realPath(n2.node);
    return a2.tryFSOperation(() => {
      t2.isFile(n2.node.mode) && (n2.shared.refcount = 1, n2.nfd = e.open(o3));
    });
  }, close(n2) {
    return s3?.("close stream", a2.realPath(n2.node)), a2.tryFSOperation(() => {
      t2.isFile(n2.node.mode) && n2.nfd && --n2.shared.refcount === 0 && e.close(n2.nfd);
    });
  }, dup(n2) {
    s3?.("dup stream", a2.realPath(n2.node)), n2.shared.refcount++;
  }, read(n2, o3, i3, u2, c2) {
    return s3?.("read stream", a2.realPath(n2.node), i3, u2, c2), u2 === 0 ? 0 : a2.tryFSOperation(() => e.read(n2.nfd, o3, i3, u2, c2));
  }, write(n2, o3, i3, u2, c2) {
    return s3?.("write stream", a2.realPath(n2.node), i3, u2, c2), a2.tryFSOperation(() => e.write(n2.nfd, o3.buffer, i3, u2, c2));
  }, llseek(n2, o3, i3) {
    s3?.("llseek stream", a2.realPath(n2.node), o3, i3);
    let u2 = o3;
    if (i3 === 1 ? u2 += n2.position : i3 === 2 && t2.isFile(n2.node.mode) && a2.tryFSOperation(() => {
      let c2 = e.fstat(n2.nfd);
      u2 += c2.size;
    }), u2 < 0)
      throw new t2.ErrnoError(28);
    return u2;
  }, mmap(n2, o3, i3, u2, c2) {
    if (s3?.("mmap stream", a2.realPath(n2.node), o3, i3, u2, c2), !t2.isFile(n2.node.mode))
      throw new t2.ErrnoError(pr.ENODEV);
    let m2 = r.mmapAlloc(o3);
    return a2.stream_ops.read(n2, r.HEAP8, m2, o3, i3), { ptr: m2, allocated: true };
  }, msync(n2, o3, i3, u2, c2) {
    return s3?.("msync stream", a2.realPath(n2.node), i3, u2, c2), a2.stream_ops.write(n2, o3, 0, u2, i3), 0;
  } } };
  return a2;
};
var init_chunk_VBDAOXYI = __esm(() => {
  init_chunk_QY3QWFKW();
  w2 = D(($r, l3) => {
    u();
    var j2 = 9007199254740991, B = function(r) {
      return r;
    }();
    function mr(r) {
      return r === B;
    }
    function q2(r) {
      return typeof r == "string" || Object.prototype.toString.call(r) == "[object String]";
    }
    function lr(r) {
      return Object.prototype.toString.call(r) == "[object Date]";
    }
    function N2(r) {
      return r !== null && typeof r == "object";
    }
    function U3(r) {
      return typeof r == "function";
    }
    function fr(r) {
      return typeof r == "number" && r > -1 && r % 1 == 0 && r <= j2;
    }
    function yr(r) {
      return Object.prototype.toString.call(r) == "[object Array]";
    }
    function Y2(r) {
      return N2(r) && !U3(r) && fr(r.length);
    }
    function D3(r) {
      return Object.prototype.toString.call(r) == "[object ArrayBuffer]";
    }
    function gr(r, e) {
      return Array.prototype.map.call(r, e);
    }
    function hr(r, e) {
      var t2 = B;
      return U3(e) && Array.prototype.every.call(r, function(s3, a2, n2) {
        var o3 = e(s3, a2, n2);
        return o3 && (t2 = s3), !o3;
      }), t2;
    }
    function Sr(r) {
      return Object.assign.apply(null, arguments);
    }
    function W2(r) {
      var e, t2, s3;
      if (q2(r)) {
        for (t2 = r.length, s3 = new Uint8Array(t2), e = 0;e < t2; e++)
          s3[e] = r.charCodeAt(e) & 255;
        return s3;
      }
      return D3(r) ? new Uint8Array(r) : N2(r) && D3(r.buffer) ? new Uint8Array(r.buffer) : Y2(r) ? new Uint8Array(r) : N2(r) && U3(r.toString) ? W2(r.toString()) : new Uint8Array;
    }
    l3.exports.MAX_SAFE_INTEGER = j2;
    l3.exports.isUndefined = mr;
    l3.exports.isString = q2;
    l3.exports.isObject = N2;
    l3.exports.isDateTime = lr;
    l3.exports.isFunction = U3;
    l3.exports.isArray = yr;
    l3.exports.isArrayLike = Y2;
    l3.exports.isArrayBuffer = D3;
    l3.exports.map = gr;
    l3.exports.find = hr;
    l3.exports.extend = Sr;
    l3.exports.toUint8Array = W2;
  });
  x4 = D((Qr, X2) => {
    u();
    var M = "\x00";
    X2.exports = { NULL_CHAR: M, TMAGIC: "ustar" + M + "00", OLDGNU_MAGIC: "ustar  " + M, REGTYPE: 0, LNKTYPE: 1, SYMTYPE: 2, CHRTYPE: 3, BLKTYPE: 4, DIRTYPE: 5, FIFOTYPE: 6, CONTTYPE: 7, TSUID: parseInt("4000", 8), TSGID: parseInt("2000", 8), TSVTX: parseInt("1000", 8), TUREAD: parseInt("0400", 8), TUWRITE: parseInt("0200", 8), TUEXEC: parseInt("0100", 8), TGREAD: parseInt("0040", 8), TGWRITE: parseInt("0020", 8), TGEXEC: parseInt("0010", 8), TOREAD: parseInt("0004", 8), TOWRITE: parseInt("0002", 8), TOEXEC: parseInt("0001", 8), TPERMALL: parseInt("0777", 8), TPERMMASK: parseInt("0777", 8) };
  });
  L3 = D((ee2, f2) => {
    u();
    var K2 = w2(), p3 = x4(), Fr = 512, I = p3.TPERMALL, V2 = 0, Z2 = 0, _3 = [["name", 100, 0, function(r, e) {
      return v2(r[e[0]], e[1]);
    }, function(r, e, t2) {
      return A2(r.slice(e, e + t2[1]));
    }], ["mode", 8, 100, function(r, e) {
      var t2 = r[e[0]] || I;
      return t2 = t2 & p3.TPERMMASK, P3(t2, e[1], I);
    }, function(r, e, t2) {
      var s3 = S2(r.slice(e, e + t2[1]));
      return s3 &= p3.TPERMMASK, s3;
    }], ["uid", 8, 108, function(r, e) {
      return P3(r[e[0]], e[1], V2);
    }, function(r, e, t2) {
      return S2(r.slice(e, e + t2[1]));
    }], ["gid", 8, 116, function(r, e) {
      return P3(r[e[0]], e[1], Z2);
    }, function(r, e, t2) {
      return S2(r.slice(e, e + t2[1]));
    }], ["size", 12, 124, function(r, e) {
      return P3(r.data.length, e[1]);
    }, function(r, e, t2) {
      return S2(r.slice(e, e + t2[1]));
    }], ["modifyTime", 12, 136, function(r, e) {
      return k3(r[e[0]], e[1]);
    }, function(r, e, t2) {
      return z2(r.slice(e, e + t2[1]));
    }], ["checksum", 8, 148, function(r, e) {
      return "        ";
    }, function(r, e, t2) {
      return S2(r.slice(e, e + t2[1]));
    }], ["type", 1, 156, function(r, e) {
      return "" + (parseInt(r[e[0]], 10) || 0) % 8;
    }, function(r, e, t2) {
      return (parseInt(String.fromCharCode(r[e]), 10) || 0) % 8;
    }], ["linkName", 100, 157, function(r, e) {
      return "";
    }, function(r, e, t2) {
      return A2(r.slice(e, e + t2[1]));
    }], ["ustar", 8, 257, function(r, e) {
      return p3.TMAGIC;
    }, function(r, e, t2) {
      return br(A2(r.slice(e, e + t2[1]), true));
    }, function(r, e) {
      return r[e[0]] == p3.TMAGIC || r[e[0]] == p3.OLDGNU_MAGIC;
    }], ["owner", 32, 265, function(r, e) {
      return v2(r[e[0]], e[1]);
    }, function(r, e, t2) {
      return A2(r.slice(e, e + t2[1]));
    }], ["group", 32, 297, function(r, e) {
      return v2(r[e[0]], e[1]);
    }, function(r, e, t2) {
      return A2(r.slice(e, e + t2[1]));
    }], ["majorNumber", 8, 329, function(r, e) {
      return "";
    }, function(r, e, t2) {
      return S2(r.slice(e, e + t2[1]));
    }], ["minorNumber", 8, 337, function(r, e) {
      return "";
    }, function(r, e, t2) {
      return S2(r.slice(e, e + t2[1]));
    }], ["prefix", 131, 345, function(r, e) {
      return v2(r[e[0]], e[1]);
    }, function(r, e, t2) {
      return A2(r.slice(e, e + t2[1]));
    }], ["accessTime", 12, 476, function(r, e) {
      return k3(r[e[0]], e[1]);
    }, function(r, e, t2) {
      return z2(r.slice(e, e + t2[1]));
    }], ["createTime", 12, 488, function(r, e) {
      return k3(r[e[0]], e[1]);
    }, function(r, e, t2) {
      return z2(r.slice(e, e + t2[1]));
    }]], $2 = function(r) {
      var e = r[r.length - 1];
      return e[2] + e[1];
    }(_3);
    function br(r) {
      if (r.length == 8) {
        var e = r.split("");
        if (e[5] == p3.NULL_CHAR)
          return (e[6] == " " || e[6] == p3.NULL_CHAR) && (e[6] = "0"), (e[7] == " " || e[7] == p3.NULL_CHAR) && (e[7] = "0"), e = e.join(""), e == p3.TMAGIC ? e : r;
        if (e[7] == p3.NULL_CHAR)
          return e[5] == p3.NULL_CHAR && (e[5] = " "), e[6] == p3.NULL_CHAR && (e[6] = " "), e == p3.OLDGNU_MAGIC ? e : r;
      }
      return r;
    }
    function v2(r, e) {
      return e -= 1, K2.isUndefined(r) && (r = ""), r = ("" + r).substr(0, e), r + p3.NULL_CHAR;
    }
    function P3(r, e, t2) {
      for (t2 = parseInt(t2) || 0, e -= 1, r = (parseInt(r) || t2).toString(8).substr(-e, e);r.length < e; )
        r = "0" + r;
      return r + p3.NULL_CHAR;
    }
    function k3(r, e) {
      if (K2.isDateTime(r))
        r = Math.floor(1 * r / 1000);
      else if (r = parseInt(r, 10), isFinite(r)) {
        if (r <= 0)
          return "";
      } else
        r = Math.floor(1 * new Date / 1000);
      return P3(r, e, 0);
    }
    function A2(r, e) {
      var t2 = String.fromCharCode.apply(null, r);
      if (e)
        return t2;
      var s3 = t2.indexOf(p3.NULL_CHAR);
      return s3 >= 0 ? t2.substr(0, s3) : t2;
    }
    function S2(r) {
      var e = String.fromCharCode.apply(null, r);
      return parseInt(e.replace(/^0+$/g, ""), 8) || 0;
    }
    function z2(r) {
      return r.length == 0 || r[0] == 0 ? null : new Date(1000 * S2(r));
    }
    function Tr2(r, e, t2) {
      var s3 = parseInt(e, 10) || 0, a2 = Math.min(s3 + $2, r.length), n2 = 0, o3 = 0, i3 = 0;
      t2 && _3.every(function(y3) {
        return y3[0] == "checksum" ? (o3 = s3 + y3[2], i3 = o3 + y3[1], false) : true;
      });
      for (var u2 = 32, c2 = s3;c2 < a2; c2++) {
        var m2 = c2 >= o3 && c2 < i3 ? u2 : r[c2];
        n2 = (n2 + m2) % 262144;
      }
      return n2;
    }
    f2.exports.recordSize = Fr;
    f2.exports.defaultFileMode = I;
    f2.exports.defaultUid = V2;
    f2.exports.defaultGid = Z2;
    f2.exports.posixHeader = _3;
    f2.exports.effectiveHeaderSize = $2;
    f2.exports.calculateChecksum = Tr2;
    f2.exports.formatTarString = v2;
    f2.exports.formatTarNumber = P3;
    f2.exports.formatTarDateTime = k3;
    f2.exports.parseTarString = A2;
    f2.exports.parseTarNumber = S2;
    f2.exports.parseTarDateTime = z2;
  });
  er = D((ne2, rr) => {
    u();
    var Ar = x4(), O3 = w2(), F3 = L3();
    function J2(r) {
      return F3.recordSize;
    }
    function Q2(r) {
      return Math.ceil(r.data.length / F3.recordSize) * F3.recordSize;
    }
    function Er2(r) {
      var e = 0;
      return r.forEach(function(t2) {
        e += J2(t2) + Q2(t2);
      }), e += F3.recordSize * 2, new Uint8Array(e);
    }
    function Pr(r, e, t2) {
      t2 = parseInt(t2) || 0;
      var s3 = t2;
      F3.posixHeader.forEach(function(u2) {
        for (var c2 = u2[3](e, u2), m2 = c2.length, y3 = 0;y3 < m2; y3 += 1)
          r[s3 + y3] = c2.charCodeAt(y3) & 255;
        s3 += u2[1];
      });
      var a2 = O3.find(F3.posixHeader, function(u2) {
        return u2[0] == "checksum";
      });
      if (a2) {
        var n2 = F3.calculateChecksum(r, t2, true), o3 = F3.formatTarNumber(n2, a2[1] - 2) + Ar.NULL_CHAR + " ";
        s3 = t2 + a2[2];
        for (var i3 = 0;i3 < o3.length; i3 += 1)
          r[s3] = o3.charCodeAt(i3) & 255, s3++;
      }
      return t2 + J2(e);
    }
    function wr(r, e, t2) {
      return t2 = parseInt(t2, 10) || 0, r.set(e.data, t2), t2 + Q2(e);
    }
    function xr(r) {
      r = O3.map(r, function(s3) {
        return O3.extend({}, s3, { data: O3.toUint8Array(s3.data) });
      });
      var e = Er2(r), t2 = 0;
      return r.forEach(function(s3) {
        t2 = Pr(e, s3, t2), t2 = wr(e, s3, t2);
      }), e;
    }
    rr.exports.tar = xr;
  });
  nr = D((oe, tr) => {
    u();
    var vr = x4(), G2 = w2(), h3 = L3(), Nr2 = { extractData: true, checkHeader: true, checkChecksum: true, checkFileSize: true }, Ur = { size: true, checksum: true, ustar: true }, R3 = { unexpectedEndOfFile: "Unexpected end of file.", fileCorrupted: "File is corrupted.", checksumCheckFailed: "Checksum check failed." };
    function kr(r) {
      return h3.recordSize;
    }
    function zr(r) {
      return Math.ceil(r / h3.recordSize) * h3.recordSize;
    }
    function Or(r, e) {
      for (var t2 = e, s3 = Math.min(r.length, e + h3.recordSize * 2), a2 = t2;a2 < s3; a2++)
        if (r[a2] != 0)
          return false;
      return true;
    }
    function Cr(r, e, t2) {
      if (r.length - e < h3.recordSize) {
        if (t2.checkFileSize)
          throw new Error(R3.unexpectedEndOfFile);
        return null;
      }
      e = parseInt(e) || 0;
      var s3 = {}, a2 = e;
      if (h3.posixHeader.forEach(function(i3) {
        s3[i3[0]] = i3[4](r, a2, i3), a2 += i3[1];
      }), s3.type != 0 && (s3.size = 0), t2.checkHeader && h3.posixHeader.forEach(function(i3) {
        if (G2.isFunction(i3[5]) && !i3[5](s3, i3)) {
          var u2 = new Error(R3.fileCorrupted);
          throw u2.data = { offset: e + i3[2], field: i3[0] }, u2;
        }
      }), t2.checkChecksum) {
        var n2 = h3.calculateChecksum(r, e, true);
        if (n2 != s3.checksum) {
          var o3 = new Error(R3.checksumCheckFailed);
          throw o3.data = { offset: e, header: s3, checksum: n2 }, o3;
        }
      }
      return s3;
    }
    function Dr(r, e, t2, s3) {
      return s3.extractData ? t2.size <= 0 ? new Uint8Array : r.slice(e, e + t2.size) : null;
    }
    function Mr(r, e) {
      var t2 = {};
      return h3.posixHeader.forEach(function(s3) {
        var a2 = s3[0];
        Ur[a2] || (t2[a2] = r[a2]);
      }), t2.isOldGNUFormat = r.ustar == vr.OLDGNU_MAGIC, e && (t2.data = e), t2;
    }
    function Ir(r, e) {
      e = G2.extend({}, Nr2, e);
      for (var t2 = [], s3 = 0, a2 = r.length;a2 - s3 >= h3.recordSize; ) {
        r = G2.toUint8Array(r);
        var n2 = Cr(r, s3, e);
        if (!n2)
          break;
        s3 += kr(n2);
        var o3 = Dr(r, s3, n2, e);
        if (t2.push(Mr(n2, o3)), s3 += zr(n2.size), Or(r, s3))
          break;
      }
      return t2;
    }
    tr.exports.untar = Ir;
  });
  or = D((se2, ir) => {
    u();
    var _r = w2(), Lr = x4(), Rr2 = er(), Gr = nr();
    _r.extend(ir.exports, Rr2, Gr, Lr);
  });
  u();
  u();
  g4 = L(or(), 1);
  Hr = ["application/x-gtar", "application/x-tar+gzip", "application/x-gzip", "application/gzip"];
  C2 = Vr + "/base";
  pr = { EBADF: 8, EBADFD: 127, EEXIST: 20, EINVAL: 28, EISDIR: 31, ENODEV: 43, ENOENT: 44, ENOTDIR: 54, ENOTEMPTY: 55 };
});

// node_modules/@electric-sql/pglite/dist/fs/nodefs.js
var exports_nodefs = {};
__export(exports_nodefs, {
  NodeFS: () => m2
});
import * as s3 from "fs";
import * as o3 from "path";
var m2;
var init_nodefs = __esm(() => {
  init_chunk_VBDAOXYI();
  init_chunk_QY3QWFKW();
  u();
  m2 = class extends ur {
    constructor(t2) {
      super(t2), this.rootDir = o3.resolve(t2), s3.existsSync(o3.join(this.rootDir)) || s3.mkdirSync(this.rootDir);
    }
    async init(t2, e) {
      return this.pg = t2, { emscriptenOpts: { ...e, preRun: [...e.preRun || [], (r) => {
        let c2 = r.FS.filesystems.NODEFS;
        r.FS.mkdir(C2), r.FS.mount(c2, { root: this.rootDir }, C2);
      }] } };
    }
    async closeFs() {
      this.pg.Module.FS.quit();
    }
  };
});

// node_modules/@electric-sql/pglite/dist/fs/opfs-ahp.js
var exports_opfs_ahp = {};
__export(exports_opfs_ahp, {
  OpfsAhpFS: () => L4
});
var $2 = "state.txt", G2 = "data", T4, H3, v2, F3, M, y3, b2, m3, x5, P3, D3, S2, n2, C3, O3, k3, w3, f2, I, W2, j2, L4, p3;
var init_opfs_ahp = __esm(() => {
  init_chunk_VBDAOXYI();
  init_chunk_QY3QWFKW();
  u();
  T4 = { DIR: 16384, FILE: 32768 };
  L4 = class extends cr {
    constructor(e, { initialPoolSize: t2 = 1000, maintainedPoolSize: o4 = 100, debug: i3 = false } = {}) {
      super(e, { debug: i3 });
      R(this, n2);
      R(this, H3);
      R(this, v2);
      R(this, F3);
      R(this, M);
      R(this, y3);
      R(this, b2, new Map);
      R(this, m3, new Map);
      R(this, x5, 0);
      R(this, P3, new Map);
      R(this, D3, new Map);
      this.lastCheckpoint = 0;
      this.checkpointInterval = 1000 * 60;
      this.poolCounter = 0;
      R(this, S2, new Set);
      this.initialPoolSize = t2, this.maintainedPoolSize = o4;
    }
    async init(e, t2) {
      return await T(this, n2, C3).call(this), super.init(e, t2);
    }
    async syncToFs(e = false) {
      await this.maybeCheckpointState(), await this.maintainPool(), e || this.flush();
    }
    async closeFs() {
      for (let e of h(this, m3).values())
        e.close();
      h(this, y3).flush(), h(this, y3).close(), this.pg.Module.FS.quit();
    }
    async maintainPool(e) {
      e = e || this.maintainedPoolSize;
      let t2 = e - this.state.pool.length, o4 = [];
      for (let i3 = 0;i3 < t2; i3++)
        o4.push(new Promise(async (c2) => {
          ++this.poolCounter;
          let a2 = `${(Date.now() - 1704063600).toString(16).padStart(8, "0")}-${this.poolCounter.toString(16).padStart(8, "0")}`, h3 = await h(this, F3).getFileHandle(a2, { create: true }), d2 = await h3.createSyncAccessHandle();
          h(this, b2).set(a2, h3), h(this, m3).set(a2, d2), T(this, n2, k3).call(this, { opp: "createPoolFile", args: [a2] }), this.state.pool.push(a2), c2();
        }));
      for (let i3 = 0;i3 > t2; i3--)
        o4.push(new Promise(async (c2) => {
          let a2 = this.state.pool.pop();
          T(this, n2, k3).call(this, { opp: "deletePoolFile", args: [a2] });
          let h3 = h(this, b2).get(a2);
          h(this, m3).get(a2)?.close(), await h(this, F3).removeEntry(h3.name), h(this, b2).delete(a2), h(this, m3).delete(a2), c2();
        }));
      await Promise.all(o4);
    }
    _createPoolFileState(e) {
      this.state.pool.push(e);
    }
    _deletePoolFileState(e) {
      let t2 = this.state.pool.indexOf(e);
      t2 > -1 && this.state.pool.splice(t2, 1);
    }
    async maybeCheckpointState() {
      Date.now() - this.lastCheckpoint > this.checkpointInterval && await this.checkpointState();
    }
    async checkpointState() {
      let e = new TextEncoder().encode(JSON.stringify(this.state));
      h(this, y3).truncate(0), h(this, y3).write(e, { at: 0 }), h(this, y3).flush(), this.lastCheckpoint = Date.now();
    }
    flush() {
      for (let e of h(this, S2))
        try {
          e.flush();
        } catch {}
      h(this, S2).clear();
    }
    chmod(e, t2) {
      T(this, n2, O3).call(this, { opp: "chmod", args: [e, t2] }, () => {
        this._chmodState(e, t2);
      });
    }
    _chmodState(e, t2) {
      let o4 = T(this, n2, f2).call(this, e);
      o4.mode = t2;
    }
    close(e) {
      let t2 = T(this, n2, I).call(this, e);
      h(this, P3).delete(e), h(this, D3).delete(t2);
    }
    fstat(e) {
      let t2 = T(this, n2, I).call(this, e);
      return this.lstat(t2);
    }
    lstat(e) {
      let t2 = T(this, n2, f2).call(this, e), o4 = t2.type === "file" ? h(this, m3).get(t2.backingFilename).getSize() : 0, i3 = 4096;
      return { dev: 0, ino: 0, mode: t2.mode, nlink: 1, uid: 0, gid: 0, rdev: 0, size: o4, blksize: i3, blocks: Math.ceil(o4 / i3), atime: t2.lastModified, mtime: t2.lastModified, ctime: t2.lastModified };
    }
    mkdir(e, t2) {
      T(this, n2, O3).call(this, { opp: "mkdir", args: [e, t2] }, () => {
        this._mkdirState(e, t2);
      });
    }
    _mkdirState(e, t2) {
      let o4 = T(this, n2, w3).call(this, e), i3 = o4.pop(), c2 = [], a2 = this.state.root;
      for (let d2 of o4) {
        if (c2.push(e), !Object.prototype.hasOwnProperty.call(a2.children, d2))
          if (t2?.recursive)
            this.mkdir(c2.join("/"));
          else
            throw new p3("ENOENT", "No such file or directory");
        if (a2.children[d2].type !== "directory")
          throw new p3("ENOTDIR", "Not a directory");
        a2 = a2.children[d2];
      }
      if (Object.prototype.hasOwnProperty.call(a2.children, i3))
        throw new p3("EEXIST", "File exists");
      let h3 = { type: "directory", lastModified: Date.now(), mode: t2?.mode || T4.DIR, children: {} };
      a2.children[i3] = h3;
    }
    open(e, t2, o4) {
      if (T(this, n2, f2).call(this, e).type !== "file")
        throw new p3("EISDIR", "Is a directory");
      let c2 = T(this, n2, W2).call(this);
      return h(this, P3).set(c2, e), h(this, D3).set(e, c2), c2;
    }
    readdir(e) {
      let t2 = T(this, n2, f2).call(this, e);
      if (t2.type !== "directory")
        throw new p3("ENOTDIR", "Not a directory");
      return Object.keys(t2.children);
    }
    read(e, t2, o4, i3, c2) {
      let a2 = T(this, n2, I).call(this, e), h3 = T(this, n2, f2).call(this, a2);
      if (h3.type !== "file")
        throw new p3("EISDIR", "Is a directory");
      return h(this, m3).get(h3.backingFilename).read(new Uint8Array(t2.buffer, o4, i3), { at: c2 });
    }
    rename(e, t2) {
      T(this, n2, O3).call(this, { opp: "rename", args: [e, t2] }, () => {
        this._renameState(e, t2, true);
      });
    }
    _renameState(e, t2, o4 = false) {
      let i3 = T(this, n2, w3).call(this, e), c2 = i3.pop(), a2 = T(this, n2, f2).call(this, i3.join("/"));
      if (!Object.prototype.hasOwnProperty.call(a2.children, c2))
        throw new p3("ENOENT", "No such file or directory");
      let h3 = T(this, n2, w3).call(this, t2), d2 = h3.pop(), l3 = T(this, n2, f2).call(this, h3.join("/"));
      if (o4 && Object.prototype.hasOwnProperty.call(l3.children, d2)) {
        let u2 = l3.children[d2];
        h(this, m3).get(u2.backingFilename).truncate(0), this.state.pool.push(u2.backingFilename);
      }
      l3.children[d2] = a2.children[c2], delete a2.children[c2];
    }
    rmdir(e) {
      T(this, n2, O3).call(this, { opp: "rmdir", args: [e] }, () => {
        this._rmdirState(e);
      });
    }
    _rmdirState(e) {
      let t2 = T(this, n2, w3).call(this, e), o4 = t2.pop(), i3 = T(this, n2, f2).call(this, t2.join("/"));
      if (!Object.prototype.hasOwnProperty.call(i3.children, o4))
        throw new p3("ENOENT", "No such file or directory");
      let c2 = i3.children[o4];
      if (c2.type !== "directory")
        throw new p3("ENOTDIR", "Not a directory");
      if (Object.keys(c2.children).length > 0)
        throw new p3("ENOTEMPTY", "Directory not empty");
      delete i3.children[o4];
    }
    truncate(e, t2 = 0) {
      let o4 = T(this, n2, f2).call(this, e);
      if (o4.type !== "file")
        throw new p3("EISDIR", "Is a directory");
      let i3 = h(this, m3).get(o4.backingFilename);
      if (!i3)
        throw new p3("ENOENT", "No such file or directory");
      i3.truncate(t2), h(this, S2).add(i3);
    }
    unlink(e) {
      T(this, n2, O3).call(this, { opp: "unlink", args: [e] }, () => {
        this._unlinkState(e, true);
      });
    }
    _unlinkState(e, t2 = false) {
      let o4 = T(this, n2, w3).call(this, e), i3 = o4.pop(), c2 = T(this, n2, f2).call(this, o4.join("/"));
      if (!Object.prototype.hasOwnProperty.call(c2.children, i3))
        throw new p3("ENOENT", "No such file or directory");
      let a2 = c2.children[i3];
      if (a2.type !== "file")
        throw new p3("EISDIR", "Is a directory");
      if (delete c2.children[i3], t2) {
        let h3 = h(this, m3).get(a2.backingFilename);
        h3?.truncate(0), h(this, S2).add(h3), h(this, D3).has(e) && (h(this, P3).delete(h(this, D3).get(e)), h(this, D3).delete(e));
      }
      this.state.pool.push(a2.backingFilename);
    }
    utimes(e, t2, o4) {
      T(this, n2, O3).call(this, { opp: "utimes", args: [e, t2, o4] }, () => {
        this._utimesState(e, t2, o4);
      });
    }
    _utimesState(e, t2, o4) {
      let i3 = T(this, n2, f2).call(this, e);
      i3.lastModified = o4;
    }
    writeFile(e, t2, o4) {
      let i3 = T(this, n2, w3).call(this, e), c2 = i3.pop(), a2 = T(this, n2, f2).call(this, i3.join("/"));
      if (Object.prototype.hasOwnProperty.call(a2.children, c2)) {
        let l3 = a2.children[c2];
        l3.lastModified = Date.now(), T(this, n2, k3).call(this, { opp: "setLastModified", args: [e, l3.lastModified] });
      } else {
        if (this.state.pool.length === 0)
          throw new Error("No more file handles available in the pool");
        let l3 = { type: "file", lastModified: Date.now(), mode: o4?.mode || T4.FILE, backingFilename: this.state.pool.pop() };
        a2.children[c2] = l3, T(this, n2, k3).call(this, { opp: "createFileNode", args: [e, l3] });
      }
      let h3 = a2.children[c2], d2 = h(this, m3).get(h3.backingFilename);
      t2.length > 0 && (d2.write(typeof t2 == "string" ? new TextEncoder().encode(t2) : new Uint8Array(t2), { at: 0 }), e.startsWith("/pg_wal") && h(this, S2).add(d2));
    }
    _createFileNodeState(e, t2) {
      let o4 = T(this, n2, w3).call(this, e), i3 = o4.pop(), c2 = T(this, n2, f2).call(this, o4.join("/"));
      c2.children[i3] = t2;
      let a2 = this.state.pool.indexOf(t2.backingFilename);
      return a2 > -1 && this.state.pool.splice(a2, 1), t2;
    }
    _setLastModifiedState(e, t2) {
      let o4 = T(this, n2, f2).call(this, e);
      o4.lastModified = t2;
    }
    write(e, t2, o4, i3, c2) {
      let a2 = T(this, n2, I).call(this, e), h3 = T(this, n2, f2).call(this, a2);
      if (h3.type !== "file")
        throw new p3("EISDIR", "Is a directory");
      let d2 = h(this, m3).get(h3.backingFilename);
      if (!d2)
        throw new p3("EBADF", "Bad file descriptor");
      let l3 = d2.write(new Uint8Array(t2, o4, i3), { at: c2 });
      return a2.startsWith("/pg_wal") && h(this, S2).add(d2), l3;
    }
  };
  H3 = new WeakMap, v2 = new WeakMap, F3 = new WeakMap, M = new WeakMap, y3 = new WeakMap, b2 = new WeakMap, m3 = new WeakMap, x5 = new WeakMap, P3 = new WeakMap, D3 = new WeakMap, S2 = new WeakMap, n2 = new WeakSet, C3 = async function() {
    x(this, H3, await navigator.storage.getDirectory()), x(this, v2, await T(this, n2, j2).call(this, this.dataDir, { create: true })), x(this, F3, await T(this, n2, j2).call(this, G2, { from: h(this, v2), create: true })), x(this, M, await h(this, v2).getFileHandle($2, { create: true })), x(this, y3, await h(this, M).createSyncAccessHandle());
    let e = new ArrayBuffer(h(this, y3).getSize());
    h(this, y3).read(e, { at: 0 });
    let t2, o4 = new TextDecoder().decode(e).split(`
`), i3 = false;
    try {
      t2 = JSON.parse(o4[0]);
    } catch {
      t2 = { root: { type: "directory", lastModified: Date.now(), mode: T4.DIR, children: {} }, pool: [] }, h(this, y3).truncate(0), h(this, y3).write(new TextEncoder().encode(JSON.stringify(t2)), { at: 0 }), i3 = true;
    }
    this.state = t2;
    let c2 = o4.slice(1).filter(Boolean).map((l3) => JSON.parse(l3));
    for (let l3 of c2) {
      let u2 = `_${l3.opp}State`;
      if (typeof this[u2] == "function")
        try {
          this[u2].bind(this)(...l3.args);
        } catch (N2) {
          console.warn("Error applying OPFS AHP WAL entry", l3, N2);
        }
    }
    let a2 = [], h3 = async (l3) => {
      if (l3.type === "file")
        try {
          let u2 = await h(this, F3).getFileHandle(l3.backingFilename), N2 = await u2.createSyncAccessHandle();
          h(this, b2).set(l3.backingFilename, u2), h(this, m3).set(l3.backingFilename, N2);
        } catch (u2) {
          console.error("Error opening file handle for node", l3, u2);
        }
      else
        for (let u2 of Object.values(l3.children))
          a2.push(h3(u2));
    };
    await h3(this.state.root);
    let d2 = [];
    for (let l3 of this.state.pool)
      d2.push(new Promise(async (u2) => {
        h(this, b2).has(l3) && console.warn("File handle already exists for pool file", l3);
        let N2 = await h(this, F3).getFileHandle(l3), U3 = await N2.createSyncAccessHandle();
        h(this, b2).set(l3, N2), h(this, m3).set(l3, U3), u2();
      }));
    await Promise.all([...a2, ...d2]), await this.maintainPool(i3 ? this.initialPoolSize : this.maintainedPoolSize);
  }, O3 = function(e, t2) {
    let o4 = T(this, n2, k3).call(this, e);
    try {
      t2();
    } catch (i3) {
      throw h(this, y3).truncate(o4), i3;
    }
  }, k3 = function(e) {
    let t2 = JSON.stringify(e), o4 = new TextEncoder().encode(`
${t2}`), i3 = h(this, y3).getSize();
    return h(this, y3).write(o4, { at: i3 }), h(this, S2).add(h(this, y3)), i3;
  }, w3 = function(e) {
    return e.split("/").filter(Boolean);
  }, f2 = function(e, t2) {
    let o4 = T(this, n2, w3).call(this, e), i3 = t2 || this.state.root;
    for (let c2 of o4) {
      if (i3.type !== "directory")
        throw new p3("ENOTDIR", "Not a directory");
      if (!Object.prototype.hasOwnProperty.call(i3.children, c2))
        throw new p3("ENOENT", "No such file or directory");
      i3 = i3.children[c2];
    }
    return i3;
  }, I = function(e) {
    let t2 = h(this, P3).get(e);
    if (!t2)
      throw new p3("EBADF", "Bad file descriptor");
    return t2;
  }, W2 = function() {
    let e = ++U(this, x5)._;
    for (;h(this, P3).has(e); )
      U(this, x5)._++;
    return e;
  }, j2 = async function(e, t2) {
    let o4 = T(this, n2, w3).call(this, e), i3 = t2?.from || h(this, H3);
    for (let c2 of o4)
      i3 = await i3.getDirectoryHandle(c2, { create: t2?.create });
    return i3;
  };
  p3 = class extends Error {
    constructor(A2, e) {
      super(e), typeof A2 == "number" ? this.code = A2 : typeof A2 == "string" && (this.code = pr[A2]);
    }
  };
});

// node_modules/@electric-sql/pglite/dist/index.js
async function ke2(e) {
  if (Fe) {
    let t2 = await import("fs"), r = await import("zlib"), { Writable: a2 } = await import("stream"), { pipeline: o4 } = await import("stream/promises");
    if (!t2.existsSync(e))
      throw new Error(`Extension bundle not found: ${e}`);
    let s4 = r.createGunzip(), n3 = [];
    return await o4(t2.createReadStream(e), s4, new a2({ write(_3, l3, p4) {
      n3.push(_3), p4();
    } })), new Blob(n3);
  } else {
    let t2 = await fetch(e.toString());
    if (!t2.ok || !t2.body)
      return null;
    if (t2.headers.get("Content-Encoding") === "gzip")
      return t2.blob();
    {
      let r = new DecompressionStream("gzip");
      return new Response(t2.body.pipeThrough(r)).blob();
    }
  }
}
async function Be2(e, t2) {
  for (let r in e.pg_extensions) {
    let a2;
    try {
      a2 = await e.pg_extensions[r];
    } catch (o4) {
      console.error("Failed to fetch extension:", r, o4);
      continue;
    }
    if (a2) {
      let o4 = new Uint8Array(await a2.arrayBuffer());
      _t2(e, r, o4, t2);
    } else
      console.error("Could not get binary data for extension:", r);
  }
}
function _t2(e, t2, r, a2) {
  Le2.default.untar(r).forEach((s4) => {
    if (!s4.name.startsWith(".")) {
      let n3 = e.WASM_PREFIX + "/" + s4.name;
      if (s4.name.endsWith(".so")) {
        let _3 = (...p4) => {
          a2("pgfs:ext OK", n3, p4);
        }, l3 = (...p4) => {
          a2("pgfs:ext FAIL", n3, p4);
        };
        e.FS.createPreloadedFile(lt2(n3), s4.name.split("/").pop().slice(0, -3), s4.data, true, true, _3, l3, false);
      } else
        try {
          let _3 = n3.substring(0, n3.lastIndexOf("/"));
          e.FS.analyzePath(_3).exists === false && e.FS.mkdirTree(_3), e.FS.writeFile(n3, s4.data);
        } catch (_3) {
          console.error(`Error writing file ${n3}`, _3);
        }
    }
  });
}
function lt2(e) {
  let t2 = e.lastIndexOf("/");
  return t2 > 0 ? e.slice(0, t2) : e;
}
function Ge2(e) {
  let t2;
  if (e?.startsWith("file://")) {
    if (e = e.slice(7), !e)
      throw new Error("Invalid dataDir, must be a valid path");
    t2 = "nodefs";
  } else
    e?.startsWith("idb://") ? (e = e.slice(6), t2 = "idbfs") : e?.startsWith("opfs-ahp://") ? (e = e.slice(11), t2 = "opfs-ahp") : !e || e?.startsWith("memory://") ? t2 = "memoryfs" : t2 = "nodefs";
  return { dataDir: e, fsType: t2 };
}
async function Ue2(e, t2) {
  let r;
  if (e && t2 === "nodefs") {
    let { NodeFS: a2 } = await Promise.resolve().then(() => (init_nodefs(), exports_nodefs));
    r = new a2(e);
  } else if (e && t2 === "idbfs")
    r = new ce3(e);
  else if (e && t2 === "opfs-ahp") {
    let { OpfsAhpFS: a2 } = await Promise.resolve().then(() => (init_opfs_ahp(), exports_opfs_ahp));
    r = new a2(e);
  } else
    r = new ge2;
  return r;
}
var dt2, mt2, st2, nt2 = function(e, t2, r, a2) {
  function o4(s4) {
    return s4 instanceof r ? s4 : new r(function(n3) {
      n3(s4);
    });
  }
  return new (r || (r = Promise))(function(s4, n3) {
    function _3(m4) {
      try {
        p4(a2.next(m4));
      } catch (d2) {
        n3(d2);
      }
    }
    function l3(m4) {
      try {
        p4(a2.throw(m4));
      } catch (d2) {
        n3(d2);
      }
    }
    function p4(m4) {
      m4.done ? s4(m4.value) : o4(m4.value).then(_3, l3);
    }
    p4((a2 = a2.apply(e, t2 || [])).next());
  });
}, Fe2 = class {
  constructor(t2, r = st2) {
    this._value = t2, this._cancelError = r, this._weightedQueues = [], this._weightedWaiters = [];
  }
  acquire(t2 = 1) {
    if (t2 <= 0)
      throw new Error(`invalid weight ${t2}: must be positive`);
    return new Promise((r, a2) => {
      this._weightedQueues[t2 - 1] || (this._weightedQueues[t2 - 1] = []), this._weightedQueues[t2 - 1].push({ resolve: r, reject: a2 }), this._dispatch();
    });
  }
  runExclusive(t2, r = 1) {
    return nt2(this, undefined, undefined, function* () {
      let [a2, o4] = yield this.acquire(r);
      try {
        return yield t2(a2);
      } finally {
        o4();
      }
    });
  }
  waitForUnlock(t2 = 1) {
    if (t2 <= 0)
      throw new Error(`invalid weight ${t2}: must be positive`);
    return new Promise((r) => {
      this._weightedWaiters[t2 - 1] || (this._weightedWaiters[t2 - 1] = []), this._weightedWaiters[t2 - 1].push(r), this._dispatch();
    });
  }
  isLocked() {
    return this._value <= 0;
  }
  getValue() {
    return this._value;
  }
  setValue(t2) {
    this._value = t2, this._dispatch();
  }
  release(t2 = 1) {
    if (t2 <= 0)
      throw new Error(`invalid weight ${t2}: must be positive`);
    this._value += t2, this._dispatch();
  }
  cancel() {
    this._weightedQueues.forEach((t2) => t2.forEach((r) => r.reject(this._cancelError))), this._weightedQueues = [];
  }
  _dispatch() {
    var t2;
    for (let r = this._value;r > 0; r--) {
      let a2 = (t2 = this._weightedQueues[r - 1]) === null || t2 === undefined ? undefined : t2.shift();
      if (!a2)
        continue;
      let o4 = this._value, s4 = r;
      this._value -= r, r = this._value + 1, a2.resolve([o4, this._newReleaser(s4)]);
    }
    this._drainUnlockWaiters();
  }
  _newReleaser(t2) {
    let r = false;
    return () => {
      r || (r = true, this.release(t2));
    };
  }
  _drainUnlockWaiters() {
    for (let t2 = this._value;t2 > 0; t2--)
      this._weightedWaiters[t2 - 1] && (this._weightedWaiters[t2 - 1].forEach((r) => r()), this._weightedWaiters[t2 - 1] = []);
  }
}, it2 = function(e, t2, r, a2) {
  function o4(s4) {
    return s4 instanceof r ? s4 : new r(function(n3) {
      n3(s4);
    });
  }
  return new (r || (r = Promise))(function(s4, n3) {
    function _3(m4) {
      try {
        p4(a2.next(m4));
      } catch (d2) {
        n3(d2);
      }
    }
    function l3(m4) {
      try {
        p4(a2.throw(m4));
      } catch (d2) {
        n3(d2);
      }
    }
    function p4(m4) {
      m4.done ? s4(m4.value) : o4(m4.value).then(_3, l3);
    }
    p4((a2 = a2.apply(e, t2 || [])).next());
  });
}, Y2 = class {
  constructor(t2) {
    this._semaphore = new Fe2(1, t2);
  }
  acquire() {
    return it2(this, undefined, undefined, function* () {
      let [, t2] = yield this._semaphore.acquire();
      return t2;
    });
  }
  runExclusive(t2) {
    return this._semaphore.runExclusive(() => t2());
  }
  isLocked() {
    return this._semaphore.isLocked();
  }
  waitForUnlock() {
    return this._semaphore.waitForUnlock();
  }
  release() {
    this._semaphore.isLocked() && this._semaphore.release();
  }
  cancel() {
    return this._semaphore.cancel();
  }
}, Le2, ce3, ge2, pt2, He2, je2, ne2, te2, re2, ie, _e2, xe2, we2, Se2, ye2, le2, pe2, he2, de2, ae, $3, I2, oe, me2, B, Q2, K2, ue2, se2, J2, O4, Z2, q2, G3, C4, Ve2, Xe2, fe2, Ke2, Ye2, L5, We2;
var init_dist = __esm(() => {
  init_chunk_F2DQ4FIK();
  init_chunk_VBDAOXYI();
  init_chunk_3WWIVTCY();
  init_chunk_F4GETNPB();
  init_chunk_QY3QWFKW();
  u();
  u();
  u();
  dt2 = new Error("timeout while waiting for mutex to become available");
  mt2 = new Error("mutex already locked");
  st2 = new Error("request for lock canceled");
  u();
  Le2 = L(or(), 1);
  u();
  u();
  ce3 = class extends ur {
    async init(t2, r) {
      return this.pg = t2, { emscriptenOpts: { ...r, preRun: [...r.preRun || [], (o4) => {
        let s4 = o4.FS.filesystems.IDBFS;
        o4.FS.mkdir("/pglite"), o4.FS.mkdir(`/pglite/${this.dataDir}`), o4.FS.mount(s4, {}, `/pglite/${this.dataDir}`), o4.FS.symlink(`/pglite/${this.dataDir}`, C2);
      }] } };
    }
    initialSyncFs() {
      return new Promise((t2, r) => {
        this.pg.Module.FS.syncfs(true, (a2) => {
          a2 ? r(a2) : t2();
        });
      });
    }
    syncToFs(t2) {
      return new Promise((r, a2) => {
        this.pg.Module.FS.syncfs(false, (o4) => {
          o4 ? a2(o4) : r();
        });
      });
    }
    async closeFs() {
      let t2 = this.pg.Module.FS.filesystems.IDBFS.dbs[this.dataDir];
      t2 && t2.close(), this.pg.Module.FS.quit();
    }
  };
  u();
  ge2 = class extends ur {
    async closeFs() {
      this.pg.Module.FS.quit();
    }
  };
  u();
  u();
  pt2 = (() => {
    var _scriptName = import.meta.url;
    return async function(moduleArg = {}) {
      var moduleRtn, Module = moduleArg, readyPromiseResolve, readyPromiseReject, readyPromise = new Promise((e, t2) => {
        readyPromiseResolve = e, readyPromiseReject = t2;
      }), ENVIRONMENT_IS_WEB = typeof window == "object", ENVIRONMENT_IS_WORKER = typeof WorkerGlobalScope < "u", ENVIRONMENT_IS_NODE = typeof process == "object" && typeof process.versions == "object" && typeof process.versions.node == "string" && process.type != "renderer";
      if (ENVIRONMENT_IS_NODE) {
        let { createRequire: e } = await import("module"), t2 = import.meta.url;
        t2.startsWith("data:") && (t2 = "/");
        var require = e(t2);
      }
      Module.expectedDataFileDownloads ?? (Module.expectedDataFileDownloads = 0), Module.expectedDataFileDownloads++, (() => {
        var e = typeof ENVIRONMENT_IS_PTHREAD < "u" && ENVIRONMENT_IS_PTHREAD, t2 = typeof ENVIRONMENT_IS_WASM_WORKER < "u" && ENVIRONMENT_IS_WASM_WORKER;
        if (e || t2)
          return;
        var r = typeof process == "object" && typeof process.versions == "object" && typeof process.versions.node == "string";
        function a2(o4) {
          var s4 = "";
          typeof window == "object" ? s4 = window.encodeURIComponent(window.location.pathname.substring(0, window.location.pathname.lastIndexOf("/")) + "/") : typeof process > "u" && typeof location < "u" && (s4 = encodeURIComponent(location.pathname.substring(0, location.pathname.lastIndexOf("/")) + "/"));
          var n3 = "pglite.data", _3 = "pglite.data", l3 = Module.locateFile ? Module.locateFile(_3, "") : _3, p4 = o4.remote_package_size;
          function m4(c2, w4, x6, S3) {
            if (r) {
              require("fs").readFile(c2, (v3, b3) => {
                v3 ? S3(v3) : x6(b3.buffer);
              });
              return;
            }
            Module.dataFileDownloads ?? (Module.dataFileDownloads = {}), fetch(c2).catch((v3) => Promise.reject(new Error(`Network Error: ${c2}`, { cause: v3 }))).then((v3) => {
              if (!v3.ok)
                return Promise.reject(new Error(`${v3.status}: ${v3.url}`));
              if (!v3.body && v3.arrayBuffer)
                return v3.arrayBuffer().then(x6);
              let b3 = v3.body.getReader(), M2 = () => b3.read().then(ee2).catch((N2) => Promise.reject(new Error(`Unexpected error while handling : ${v3.url} ${N2}`, { cause: N2 }))), y4 = [], F4 = v3.headers, R3 = Number(F4.get("Content-Length") ?? w4), U3 = 0, ee2 = ({ done: N2, value: H4 }) => {
                if (N2) {
                  let A2 = new Uint8Array(y4.map((T5) => T5.length).reduce((T5, $e2) => T5 + $e2, 0)), D4 = 0;
                  for (let T5 of y4)
                    A2.set(T5, D4), D4 += T5.length;
                  x6(A2.buffer);
                } else {
                  y4.push(H4), U3 += H4.length, Module.dataFileDownloads[c2] = { loaded: U3, total: R3 };
                  let A2 = 0, D4 = 0;
                  for (let T5 of Object.values(Module.dataFileDownloads))
                    A2 += T5.loaded, D4 += T5.total;
                  return Module.setStatus?.(`Downloading data... (${A2}/${D4})`), M2();
                }
              };
              return Module.setStatus?.("Downloading data..."), M2();
            });
          }
          function d2(c2) {
            console.error("package error:", c2);
          }
          var g5 = null, u2 = Module.getPreloadedPackage ? Module.getPreloadedPackage(l3, p4) : null;
          u2 || m4(l3, p4, (c2) => {
            g5 ? (g5(c2), g5 = null) : u2 = c2;
          }, d2);
          function f3(c2) {
            function w4(M2, y4) {
              if (!M2)
                throw y4 + new Error().stack;
            }
            c2.FS_createPath("/", "home", true, true), c2.FS_createPath("/home", "web_user", true, true), c2.FS_createPath("/", "tmp", true, true), c2.FS_createPath("/tmp", "pglite", true, true), c2.FS_createPath("/tmp/pglite", "bin", true, true), c2.FS_createPath("/tmp/pglite", "lib", true, true), c2.FS_createPath("/tmp/pglite/lib", "postgresql", true, true), c2.FS_createPath("/tmp/pglite/lib/postgresql", "pgxs", true, true), c2.FS_createPath("/tmp/pglite/lib/postgresql/pgxs", "config", true, true), c2.FS_createPath("/tmp/pglite/lib/postgresql/pgxs", "src", true, true), c2.FS_createPath("/tmp/pglite/lib/postgresql/pgxs/src", "makefiles", true, true), c2.FS_createPath("/tmp/pglite", "share", true, true), c2.FS_createPath("/tmp/pglite/share", "postgresql", true, true), c2.FS_createPath("/tmp/pglite/share/postgresql", "extension", true, true), c2.FS_createPath("/tmp/pglite/share/postgresql", "timezone", true, true), c2.FS_createPath("/tmp/pglite/share/postgresql/timezone", "Africa", true, true), c2.FS_createPath("/tmp/pglite/share/postgresql/timezone", "America", true, true), c2.FS_createPath("/tmp/pglite/share/postgresql/timezone/America", "Argentina", true, true), c2.FS_createPath("/tmp/pglite/share/postgresql/timezone/America", "Indiana", true, true), c2.FS_createPath("/tmp/pglite/share/postgresql/timezone/America", "Kentucky", true, true), c2.FS_createPath("/tmp/pglite/share/postgresql/timezone/America", "North_Dakota", true, true), c2.FS_createPath("/tmp/pglite/share/postgresql/timezone", "Antarctica", true, true), c2.FS_createPath("/tmp/pglite/share/postgresql/timezone", "Arctic", true, true), c2.FS_createPath("/tmp/pglite/share/postgresql/timezone", "Asia", true, true), c2.FS_createPath("/tmp/pglite/share/postgresql/timezone", "Atlantic", true, true), c2.FS_createPath("/tmp/pglite/share/postgresql/timezone", "Australia", true, true), c2.FS_createPath("/tmp/pglite/share/postgresql/timezone", "Brazil", true, true), c2.FS_createPath("/tmp/pglite/share/postgresql/timezone", "Canada", true, true), c2.FS_createPath("/tmp/pglite/share/postgresql/timezone", "Chile", true, true), c2.FS_createPath("/tmp/pglite/share/postgresql/timezone", "Etc", true, true), c2.FS_createPath("/tmp/pglite/share/postgresql/timezone", "Europe", true, true), c2.FS_createPath("/tmp/pglite/share/postgresql/timezone", "Indian", true, true), c2.FS_createPath("/tmp/pglite/share/postgresql/timezone", "Mexico", true, true), c2.FS_createPath("/tmp/pglite/share/postgresql/timezone", "Pacific", true, true), c2.FS_createPath("/tmp/pglite/share/postgresql/timezone", "US", true, true), c2.FS_createPath("/tmp/pglite/share/postgresql", "timezonesets", true, true), c2.FS_createPath("/tmp/pglite/share/postgresql", "tsearch_data", true, true);
            function x6(M2, y4, F4) {
              this.start = M2, this.end = y4, this.audio = F4;
            }
            x6.prototype = { requests: {}, open: function(M2, y4) {
              this.name = y4, this.requests[y4] = this, c2.addRunDependency(`fp ${this.name}`);
            }, send: function() {}, onload: function() {
              var M2 = this.byteArray.subarray(this.start, this.end);
              this.finish(M2);
            }, finish: function(M2) {
              var y4 = this;
              c2.FS_createDataFile(this.name, null, M2, true, true, true), c2.removeRunDependency(`fp ${y4.name}`), this.requests[this.name] = null;
            } };
            for (var S3 = o4.files, v3 = 0;v3 < S3.length; ++v3)
              new x6(S3[v3].start, S3[v3].end, S3[v3].audio || 0).open("GET", S3[v3].filename);
            function b3(M2) {
              w4(M2, "Loading data file failed."), w4(M2.constructor.name === ArrayBuffer.name, "bad input to processPackageData");
              var y4 = new Uint8Array(M2);
              x6.prototype.byteArray = y4;
              for (var F4 = o4.files, R3 = 0;R3 < F4.length; ++R3)
                x6.prototype.requests[F4[R3].filename].onload();
              c2.removeRunDependency("datafile_pglite.data");
            }
            c2.addRunDependency("datafile_pglite.data"), c2.preloadResults ?? (c2.preloadResults = {}), c2.preloadResults[n3] = { fromCache: false }, u2 ? (b3(u2), u2 = null) : g5 = b3;
          }
          Module.calledRun ? f3(Module) : (Module.preRun ?? (Module.preRun = [])).push(f3);
        }
        a2({ files: [{ filename: "/home/web_user/.pgpass", start: 0, end: 204 }, { filename: "/tmp/pglite/bin/initdb", start: 204, end: 223 }, { filename: "/tmp/pglite/bin/postgres", start: 223, end: 242 }, { filename: "/tmp/pglite/lib/postgresql/cyrillic_and_mic.so", start: 242, end: 4736 }, { filename: "/tmp/pglite/lib/postgresql/dict_snowball.so", start: 4736, end: 577939 }, { filename: "/tmp/pglite/lib/postgresql/euc2004_sjis2004.so", start: 577939, end: 580012 }, { filename: "/tmp/pglite/lib/postgresql/euc_cn_and_mic.so", start: 580012, end: 580953 }, { filename: "/tmp/pglite/lib/postgresql/euc_jp_and_sjis.so", start: 580953, end: 588213 }, { filename: "/tmp/pglite/lib/postgresql/euc_kr_and_mic.so", start: 588213, end: 589164 }, { filename: "/tmp/pglite/lib/postgresql/euc_tw_and_big5.so", start: 589164, end: 593722 }, { filename: "/tmp/pglite/lib/postgresql/latin2_and_win1250.so", start: 593722, end: 595128 }, { filename: "/tmp/pglite/lib/postgresql/latin_and_mic.so", start: 595128, end: 596149 }, { filename: "/tmp/pglite/lib/postgresql/libpqwalreceiver.so", start: 596149, end: 717020 }, { filename: "/tmp/pglite/lib/postgresql/pgoutput.so", start: 717020, end: 730469 }, { filename: "/tmp/pglite/lib/postgresql/pgxs/config/install-sh", start: 730469, end: 744466 }, { filename: "/tmp/pglite/lib/postgresql/pgxs/config/missing", start: 744466, end: 745814 }, { filename: "/tmp/pglite/lib/postgresql/pgxs/src/Makefile.global", start: 745814, end: 782478 }, { filename: "/tmp/pglite/lib/postgresql/pgxs/src/Makefile.port", start: 782478, end: 783331 }, { filename: "/tmp/pglite/lib/postgresql/pgxs/src/Makefile.shlib", start: 783331, end: 798759 }, { filename: "/tmp/pglite/lib/postgresql/pgxs/src/makefiles/pgxs.mk", start: 798759, end: 814724 }, { filename: "/tmp/pglite/lib/postgresql/pgxs/src/nls-global.mk", start: 814724, end: 821592 }, { filename: "/tmp/pglite/lib/postgresql/plpgsql.so", start: 821592, end: 973259 }, { filename: "/tmp/pglite/lib/postgresql/utf8_and_big5.so", start: 973259, end: 1088007 }, { filename: "/tmp/pglite/lib/postgresql/utf8_and_cyrillic.so", start: 1088007, end: 1093981 }, { filename: "/tmp/pglite/lib/postgresql/utf8_and_euc2004.so", start: 1093981, end: 1298913 }, { filename: "/tmp/pglite/lib/postgresql/utf8_and_euc_cn.so", start: 1298913, end: 1374093 }, { filename: "/tmp/pglite/lib/postgresql/utf8_and_euc_jp.so", start: 1374093, end: 1525321 }, { filename: "/tmp/pglite/lib/postgresql/utf8_and_euc_kr.so", start: 1525321, end: 1628177 }, { filename: "/tmp/pglite/lib/postgresql/utf8_and_euc_tw.so", start: 1628177, end: 1827733 }, { filename: "/tmp/pglite/lib/postgresql/utf8_and_gb18030.so", start: 1827733, end: 2090110 }, { filename: "/tmp/pglite/lib/postgresql/utf8_and_gbk.so", start: 2090110, end: 2236642 }, { filename: "/tmp/pglite/lib/postgresql/utf8_and_iso8859.so", start: 2236642, end: 2260217 }, { filename: "/tmp/pglite/lib/postgresql/utf8_and_iso8859_1.so", start: 2260217, end: 2261189 }, { filename: "/tmp/pglite/lib/postgresql/utf8_and_johab.so", start: 2261189, end: 2422893 }, { filename: "/tmp/pglite/lib/postgresql/utf8_and_sjis.so", start: 2422893, end: 2504553 }, { filename: "/tmp/pglite/lib/postgresql/utf8_and_sjis2004.so", start: 2504553, end: 2631185 }, { filename: "/tmp/pglite/lib/postgresql/utf8_and_uhc.so", start: 2631185, end: 2798457 }, { filename: "/tmp/pglite/lib/postgresql/utf8_and_win.so", start: 2798457, end: 2824959 }, { filename: "/tmp/pglite/password", start: 2824959, end: 2824968 }, { filename: "/tmp/pglite/share/postgresql/errcodes.txt", start: 2824968, end: 2858360 }, { filename: "/tmp/pglite/share/postgresql/extension/plpgsql--1.0.sql", start: 2858360, end: 2859018 }, { filename: "/tmp/pglite/share/postgresql/extension/plpgsql.control", start: 2859018, end: 2859211 }, { filename: "/tmp/pglite/share/postgresql/information_schema.sql", start: 2859211, end: 2974734 }, { filename: "/tmp/pglite/share/postgresql/pg_hba.conf.sample", start: 2974734, end: 2980359 }, { filename: "/tmp/pglite/share/postgresql/pg_ident.conf.sample", start: 2980359, end: 2982999 }, { filename: "/tmp/pglite/share/postgresql/pg_service.conf.sample", start: 2982999, end: 2983603 }, { filename: "/tmp/pglite/share/postgresql/postgres.bki", start: 2983603, end: 3936871 }, { filename: "/tmp/pglite/share/postgresql/postgresql.conf.sample", start: 3936871, end: 3967533 }, { filename: "/tmp/pglite/share/postgresql/psqlrc.sample", start: 3967533, end: 3967811 }, { filename: "/tmp/pglite/share/postgresql/snowball_create.sql", start: 3967811, end: 4011987 }, { filename: "/tmp/pglite/share/postgresql/sql_features.txt", start: 4011987, end: 4047720 }, { filename: "/tmp/pglite/share/postgresql/system_constraints.sql", start: 4047720, end: 4056615 }, { filename: "/tmp/pglite/share/postgresql/system_functions.sql", start: 4056615, end: 4080918 }, { filename: "/tmp/pglite/share/postgresql/system_views.sql", start: 4080918, end: 4132612 }, { filename: "/tmp/pglite/share/postgresql/timezone/Africa/Abidjan", start: 4132612, end: 4132760 }, { filename: "/tmp/pglite/share/postgresql/timezone/Africa/Accra", start: 4132760, end: 4132908 }, { filename: "/tmp/pglite/share/postgresql/timezone/Africa/Addis_Ababa", start: 4132908, end: 4133173 }, { filename: "/tmp/pglite/share/postgresql/timezone/Africa/Algiers", start: 4133173, end: 4133908 }, { filename: "/tmp/pglite/share/postgresql/timezone/Africa/Asmara", start: 4133908, end: 4134173 }, { filename: "/tmp/pglite/share/postgresql/timezone/Africa/Asmera", start: 4134173, end: 4134438 }, { filename: "/tmp/pglite/share/postgresql/timezone/Africa/Bamako", start: 4134438, end: 4134586 }, { filename: "/tmp/pglite/share/postgresql/timezone/Africa/Bangui", start: 4134586, end: 4134821 }, { filename: "/tmp/pglite/share/postgresql/timezone/Africa/Banjul", start: 4134821, end: 4134969 }, { filename: "/tmp/pglite/share/postgresql/timezone/Africa/Bissau", start: 4134969, end: 4135163 }, { filename: "/tmp/pglite/share/postgresql/timezone/Africa/Blantyre", start: 4135163, end: 4135312 }, { filename: "/tmp/pglite/share/postgresql/timezone/Africa/Brazzaville", start: 4135312, end: 4135547 }, { filename: "/tmp/pglite/share/postgresql/timezone/Africa/Bujumbura", start: 4135547, end: 4135696 }, { filename: "/tmp/pglite/share/postgresql/timezone/Africa/Cairo", start: 4135696, end: 4138095 }, { filename: "/tmp/pglite/share/postgresql/timezone/Africa/Casablanca", start: 4138095, end: 4140524 }, { filename: "/tmp/pglite/share/postgresql/timezone/Africa/Ceuta", start: 4140524, end: 4142576 }, { filename: "/tmp/pglite/share/postgresql/timezone/Africa/Conakry", start: 4142576, end: 4142724 }, { filename: "/tmp/pglite/share/postgresql/timezone/Africa/Dakar", start: 4142724, end: 4142872 }, { filename: "/tmp/pglite/share/postgresql/timezone/Africa/Dar_es_Salaam", start: 4142872, end: 4143137 }, { filename: "/tmp/pglite/share/postgresql/timezone/Africa/Djibouti", start: 4143137, end: 4143402 }, { filename: "/tmp/pglite/share/postgresql/timezone/Africa/Douala", start: 4143402, end: 4143637 }, { filename: "/tmp/pglite/share/postgresql/timezone/Africa/El_Aaiun", start: 4143637, end: 4145932 }, { filename: "/tmp/pglite/share/postgresql/timezone/Africa/Freetown", start: 4145932, end: 4146080 }, { filename: "/tmp/pglite/share/postgresql/timezone/Africa/Gaborone", start: 4146080, end: 4146229 }, { filename: "/tmp/pglite/share/postgresql/timezone/Africa/Harare", start: 4146229, end: 4146378 }, { filename: "/tmp/pglite/share/postgresql/timezone/Africa/Johannesburg", start: 4146378, end: 4146624 }, { filename: "/tmp/pglite/share/postgresql/timezone/Africa/Juba", start: 4146624, end: 4147303 }, { filename: "/tmp/pglite/share/postgresql/timezone/Africa/Kampala", start: 4147303, end: 4147568 }, { filename: "/tmp/pglite/share/postgresql/timezone/Africa/Khartoum", start: 4147568, end: 4148247 }, { filename: "/tmp/pglite/share/postgresql/timezone/Africa/Kigali", start: 4148247, end: 4148396 }, { filename: "/tmp/pglite/share/postgresql/timezone/Africa/Kinshasa", start: 4148396, end: 4148631 }, { filename: "/tmp/pglite/share/postgresql/timezone/Africa/Lagos", start: 4148631, end: 4148866 }, { filename: "/tmp/pglite/share/postgresql/timezone/Africa/Libreville", start: 4148866, end: 4149101 }, { filename: "/tmp/pglite/share/postgresql/timezone/Africa/Lome", start: 4149101, end: 4149249 }, { filename: "/tmp/pglite/share/postgresql/timezone/Africa/Luanda", start: 4149249, end: 4149484 }, { filename: "/tmp/pglite/share/postgresql/timezone/Africa/Lubumbashi", start: 4149484, end: 4149633 }, { filename: "/tmp/pglite/share/postgresql/timezone/Africa/Lusaka", start: 4149633, end: 4149782 }, { filename: "/tmp/pglite/share/postgresql/timezone/Africa/Malabo", start: 4149782, end: 4150017 }, { filename: "/tmp/pglite/share/postgresql/timezone/Africa/Maputo", start: 4150017, end: 4150166 }, { filename: "/tmp/pglite/share/postgresql/timezone/Africa/Maseru", start: 4150166, end: 4150412 }, { filename: "/tmp/pglite/share/postgresql/timezone/Africa/Mbabane", start: 4150412, end: 4150658 }, { filename: "/tmp/pglite/share/postgresql/timezone/Africa/Mogadishu", start: 4150658, end: 4150923 }, { filename: "/tmp/pglite/share/postgresql/timezone/Africa/Monrovia", start: 4150923, end: 4151131 }, { filename: "/tmp/pglite/share/postgresql/timezone/Africa/Nairobi", start: 4151131, end: 4151396 }, { filename: "/tmp/pglite/share/postgresql/timezone/Africa/Ndjamena", start: 4151396, end: 4151595 }, { filename: "/tmp/pglite/share/postgresql/timezone/Africa/Niamey", start: 4151595, end: 4151830 }, { filename: "/tmp/pglite/share/postgresql/timezone/Africa/Nouakchott", start: 4151830, end: 4151978 }, { filename: "/tmp/pglite/share/postgresql/timezone/Africa/Ouagadougou", start: 4151978, end: 4152126 }, { filename: "/tmp/pglite/share/postgresql/timezone/Africa/Porto-Novo", start: 4152126, end: 4152361 }, { filename: "/tmp/pglite/share/postgresql/timezone/Africa/Sao_Tome", start: 4152361, end: 4152615 }, { filename: "/tmp/pglite/share/postgresql/timezone/Africa/Timbuktu", start: 4152615, end: 4152763 }, { filename: "/tmp/pglite/share/postgresql/timezone/Africa/Tripoli", start: 4152763, end: 4153388 }, { filename: "/tmp/pglite/share/postgresql/timezone/Africa/Tunis", start: 4153388, end: 4154077 }, { filename: "/tmp/pglite/share/postgresql/timezone/Africa/Windhoek", start: 4154077, end: 4155032 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Adak", start: 4155032, end: 4157388 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Anchorage", start: 4157388, end: 4159759 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Anguilla", start: 4159759, end: 4160005 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Antigua", start: 4160005, end: 4160251 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Araguaina", start: 4160251, end: 4161135 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Argentina/Buenos_Aires", start: 4161135, end: 4162211 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Argentina/Catamarca", start: 4162211, end: 4163287 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Argentina/ComodRivadavia", start: 4163287, end: 4164363 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Argentina/Cordoba", start: 4164363, end: 4165439 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Argentina/Jujuy", start: 4165439, end: 4166487 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Argentina/La_Rioja", start: 4166487, end: 4167577 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Argentina/Mendoza", start: 4167577, end: 4168653 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Argentina/Rio_Gallegos", start: 4168653, end: 4169729 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Argentina/Salta", start: 4169729, end: 4170777 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Argentina/San_Juan", start: 4170777, end: 4171867 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Argentina/San_Luis", start: 4171867, end: 4172969 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Argentina/Tucuman", start: 4172969, end: 4174073 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Argentina/Ushuaia", start: 4174073, end: 4175149 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Aruba", start: 4175149, end: 4175395 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Asuncion", start: 4175395, end: 4177053 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Atikokan", start: 4177053, end: 4177235 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Atka", start: 4177235, end: 4179591 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Bahia", start: 4179591, end: 4180615 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Bahia_Banderas", start: 4180615, end: 4181715 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Barbados", start: 4181715, end: 4182151 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Belem", start: 4182151, end: 4182727 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Belize", start: 4182727, end: 4184341 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Blanc-Sablon", start: 4184341, end: 4184587 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Boa_Vista", start: 4184587, end: 4185219 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Bogota", start: 4185219, end: 4185465 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Boise", start: 4185465, end: 4187875 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Buenos_Aires", start: 4187875, end: 4188951 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Cambridge_Bay", start: 4188951, end: 4191205 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Campo_Grande", start: 4191205, end: 4192649 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Cancun", start: 4192649, end: 4193513 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Caracas", start: 4193513, end: 4193777 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Catamarca", start: 4193777, end: 4194853 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Cayenne", start: 4194853, end: 4195051 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Cayman", start: 4195051, end: 4195233 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Chicago", start: 4195233, end: 4198825 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Chihuahua", start: 4198825, end: 4199927 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Ciudad_Juarez", start: 4199927, end: 4201465 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Coral_Harbour", start: 4201465, end: 4201647 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Cordoba", start: 4201647, end: 4202723 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Costa_Rica", start: 4202723, end: 4203039 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Coyhaique", start: 4203039, end: 4205179 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Creston", start: 4205179, end: 4205539 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Cuiaba", start: 4205539, end: 4206955 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Curacao", start: 4206955, end: 4207201 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Danmarkshavn", start: 4207201, end: 4207899 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Dawson", start: 4207899, end: 4209513 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Dawson_Creek", start: 4209513, end: 4210563 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Denver", start: 4210563, end: 4213023 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Detroit", start: 4213023, end: 4215253 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Dominica", start: 4215253, end: 4215499 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Edmonton", start: 4215499, end: 4217831 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Eirunepe", start: 4217831, end: 4218487 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/El_Salvador", start: 4218487, end: 4218711 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Ensenada", start: 4218711, end: 4221169 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Fort_Nelson", start: 4221169, end: 4223409 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Fort_Wayne", start: 4223409, end: 4225091 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Fortaleza", start: 4225091, end: 4225807 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Glace_Bay", start: 4225807, end: 4227999 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Godthab", start: 4227999, end: 4229902 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Goose_Bay", start: 4229902, end: 4233112 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Grand_Turk", start: 4233112, end: 4234946 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Grenada", start: 4234946, end: 4235192 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Guadeloupe", start: 4235192, end: 4235438 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Guatemala", start: 4235438, end: 4235718 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Guayaquil", start: 4235718, end: 4235964 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Guyana", start: 4235964, end: 4236226 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Halifax", start: 4236226, end: 4239650 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Havana", start: 4239650, end: 4242066 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Hermosillo", start: 4242066, end: 4242454 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Indiana/Indianapolis", start: 4242454, end: 4244136 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Indiana/Knox", start: 4244136, end: 4246580 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Indiana/Marengo", start: 4246580, end: 4248318 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Indiana/Petersburg", start: 4248318, end: 4250238 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Indiana/Tell_City", start: 4250238, end: 4251938 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Indiana/Vevay", start: 4251938, end: 4253368 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Indiana/Vincennes", start: 4253368, end: 4255078 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Indiana/Winamac", start: 4255078, end: 4256872 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Indianapolis", start: 4256872, end: 4258554 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Inuvik", start: 4258554, end: 4260628 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Iqaluit", start: 4260628, end: 4262830 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Jamaica", start: 4262830, end: 4263312 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Jujuy", start: 4263312, end: 4264360 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Juneau", start: 4264360, end: 4266713 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Kentucky/Louisville", start: 4266713, end: 4269501 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Kentucky/Monticello", start: 4269501, end: 4271869 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Knox_IN", start: 4271869, end: 4274313 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Kralendijk", start: 4274313, end: 4274559 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/La_Paz", start: 4274559, end: 4274791 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Lima", start: 4274791, end: 4275197 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Los_Angeles", start: 4275197, end: 4278049 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Louisville", start: 4278049, end: 4280837 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Lower_Princes", start: 4280837, end: 4281083 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Maceio", start: 4281083, end: 4281827 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Managua", start: 4281827, end: 4282257 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Manaus", start: 4282257, end: 4282861 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Marigot", start: 4282861, end: 4283107 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Martinique", start: 4283107, end: 4283339 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Matamoros", start: 4283339, end: 4284757 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Mazatlan", start: 4284757, end: 4285817 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Mendoza", start: 4285817, end: 4286893 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Menominee", start: 4286893, end: 4289167 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Merida", start: 4289167, end: 4290171 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Metlakatla", start: 4290171, end: 4291594 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Mexico_City", start: 4291594, end: 4292816 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Miquelon", start: 4292816, end: 4294482 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Moncton", start: 4294482, end: 4297636 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Monterrey", start: 4297636, end: 4298750 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Montevideo", start: 4298750, end: 4300260 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Montreal", start: 4300260, end: 4303754 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Montserrat", start: 4303754, end: 4304000 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Nassau", start: 4304000, end: 4307494 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/New_York", start: 4307494, end: 4311046 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Nipigon", start: 4311046, end: 4314540 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Nome", start: 4314540, end: 4316907 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Noronha", start: 4316907, end: 4317623 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/North_Dakota/Beulah", start: 4317623, end: 4320019 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/North_Dakota/Center", start: 4320019, end: 4322415 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/North_Dakota/New_Salem", start: 4322415, end: 4324811 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Nuuk", start: 4324811, end: 4326714 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Ojinaga", start: 4326714, end: 4328238 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Panama", start: 4328238, end: 4328420 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Pangnirtung", start: 4328420, end: 4330622 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Paramaribo", start: 4330622, end: 4330884 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Phoenix", start: 4330884, end: 4331244 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Port-au-Prince", start: 4331244, end: 4332678 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Port_of_Spain", start: 4332678, end: 4332924 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Porto_Acre", start: 4332924, end: 4333552 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Porto_Velho", start: 4333552, end: 4334128 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Puerto_Rico", start: 4334128, end: 4334374 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Punta_Arenas", start: 4334374, end: 4336290 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Rainy_River", start: 4336290, end: 4339158 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Rankin_Inlet", start: 4339158, end: 4341224 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Recife", start: 4341224, end: 4341940 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Regina", start: 4341940, end: 4342920 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Resolute", start: 4342920, end: 4344986 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Rio_Branco", start: 4344986, end: 4345614 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Rosario", start: 4345614, end: 4346690 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Santa_Isabel", start: 4346690, end: 4349148 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Santarem", start: 4349148, end: 4349750 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Santiago", start: 4349750, end: 4352279 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Santo_Domingo", start: 4352279, end: 4352737 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Sao_Paulo", start: 4352737, end: 4354181 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Scoresbysund", start: 4354181, end: 4356130 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Shiprock", start: 4356130, end: 4358590 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Sitka", start: 4358590, end: 4360919 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/St_Barthelemy", start: 4360919, end: 4361165 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/St_Johns", start: 4361165, end: 4364820 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/St_Kitts", start: 4364820, end: 4365066 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/St_Lucia", start: 4365066, end: 4365312 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/St_Thomas", start: 4365312, end: 4365558 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/St_Vincent", start: 4365558, end: 4365804 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Swift_Current", start: 4365804, end: 4366364 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Tegucigalpa", start: 4366364, end: 4366616 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Thule", start: 4366616, end: 4368118 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Thunder_Bay", start: 4368118, end: 4371612 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Tijuana", start: 4371612, end: 4374070 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Toronto", start: 4374070, end: 4377564 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Tortola", start: 4377564, end: 4377810 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Vancouver", start: 4377810, end: 4380702 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Virgin", start: 4380702, end: 4380948 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Whitehorse", start: 4380948, end: 4382562 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Winnipeg", start: 4382562, end: 4385430 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Yakutat", start: 4385430, end: 4387735 }, { filename: "/tmp/pglite/share/postgresql/timezone/America/Yellowknife", start: 4387735, end: 4390067 }, { filename: "/tmp/pglite/share/postgresql/timezone/Antarctica/Casey", start: 4390067, end: 4390504 }, { filename: "/tmp/pglite/share/postgresql/timezone/Antarctica/Davis", start: 4390504, end: 4390801 }, { filename: "/tmp/pglite/share/postgresql/timezone/Antarctica/DumontDUrville", start: 4390801, end: 4390987 }, { filename: "/tmp/pglite/share/postgresql/timezone/Antarctica/Macquarie", start: 4390987, end: 4393247 }, { filename: "/tmp/pglite/share/postgresql/timezone/Antarctica/Mawson", start: 4393247, end: 4393446 }, { filename: "/tmp/pglite/share/postgresql/timezone/Antarctica/McMurdo", start: 4393446, end: 4395883 }, { filename: "/tmp/pglite/share/postgresql/timezone/Antarctica/Palmer", start: 4395883, end: 4397301 }, { filename: "/tmp/pglite/share/postgresql/timezone/Antarctica/Rothera", start: 4397301, end: 4397465 }, { filename: "/tmp/pglite/share/postgresql/timezone/Antarctica/South_Pole", start: 4397465, end: 4399902 }, { filename: "/tmp/pglite/share/postgresql/timezone/Antarctica/Syowa", start: 4399902, end: 4400067 }, { filename: "/tmp/pglite/share/postgresql/timezone/Antarctica/Troll", start: 4400067, end: 4401229 }, { filename: "/tmp/pglite/share/postgresql/timezone/Antarctica/Vostok", start: 4401229, end: 4401456 }, { filename: "/tmp/pglite/share/postgresql/timezone/Arctic/Longyearbyen", start: 4401456, end: 4403754 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Aden", start: 4403754, end: 4403919 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Almaty", start: 4403919, end: 4404916 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Amman", start: 4404916, end: 4406363 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Anadyr", start: 4406363, end: 4407551 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Aqtau", start: 4407551, end: 4408534 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Aqtobe", start: 4408534, end: 4409545 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Ashgabat", start: 4409545, end: 4410164 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Ashkhabad", start: 4410164, end: 4410783 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Atyrau", start: 4410783, end: 4411774 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Baghdad", start: 4411774, end: 4412757 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Bahrain", start: 4412757, end: 4412956 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Baku", start: 4412956, end: 4414183 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Bangkok", start: 4414183, end: 4414382 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Barnaul", start: 4414382, end: 4415603 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Beirut", start: 4415603, end: 4417757 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Bishkek", start: 4417757, end: 4418740 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Brunei", start: 4418740, end: 4419223 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Calcutta", start: 4419223, end: 4419508 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Chita", start: 4419508, end: 4420729 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Choibalsan", start: 4420729, end: 4421620 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Chongqing", start: 4421620, end: 4422181 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Chungking", start: 4422181, end: 4422742 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Colombo", start: 4422742, end: 4423114 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Dacca", start: 4423114, end: 4423451 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Damascus", start: 4423451, end: 4425338 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Dhaka", start: 4425338, end: 4425675 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Dili", start: 4425675, end: 4425946 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Dubai", start: 4425946, end: 4426111 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Dushanbe", start: 4426111, end: 4426702 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Famagusta", start: 4426702, end: 4428730 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Gaza", start: 4428730, end: 4432574 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Harbin", start: 4432574, end: 4433135 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Hebron", start: 4433135, end: 4437007 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Ho_Chi_Minh", start: 4437007, end: 4437358 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Hong_Kong", start: 4437358, end: 4438591 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Hovd", start: 4438591, end: 4439482 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Irkutsk", start: 4439482, end: 4440725 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Istanbul", start: 4440725, end: 4442672 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Jakarta", start: 4442672, end: 4443055 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Jayapura", start: 4443055, end: 4443276 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Jerusalem", start: 4443276, end: 4445664 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Kabul", start: 4445664, end: 4445872 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Kamchatka", start: 4445872, end: 4447038 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Karachi", start: 4447038, end: 4447417 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Kashgar", start: 4447417, end: 4447582 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Kathmandu", start: 4447582, end: 4447794 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Katmandu", start: 4447794, end: 4448006 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Khandyga", start: 4448006, end: 4449277 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Kolkata", start: 4449277, end: 4449562 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Krasnoyarsk", start: 4449562, end: 4450769 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Kuala_Lumpur", start: 4450769, end: 4451184 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Kuching", start: 4451184, end: 4451667 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Kuwait", start: 4451667, end: 4451832 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Macao", start: 4451832, end: 4453059 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Macau", start: 4453059, end: 4454286 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Magadan", start: 4454286, end: 4455508 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Makassar", start: 4455508, end: 4455762 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Manila", start: 4455762, end: 4456184 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Muscat", start: 4456184, end: 4456349 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Nicosia", start: 4456349, end: 4458351 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Novokuznetsk", start: 4458351, end: 4459516 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Novosibirsk", start: 4459516, end: 4460737 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Omsk", start: 4460737, end: 4461944 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Oral", start: 4461944, end: 4462949 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Phnom_Penh", start: 4462949, end: 4463148 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Pontianak", start: 4463148, end: 4463501 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Pyongyang", start: 4463501, end: 4463738 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Qatar", start: 4463738, end: 4463937 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Qostanay", start: 4463937, end: 4464976 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Qyzylorda", start: 4464976, end: 4466001 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Rangoon", start: 4466001, end: 4466269 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Riyadh", start: 4466269, end: 4466434 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Saigon", start: 4466434, end: 4466785 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Sakhalin", start: 4466785, end: 4467987 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Samarkand", start: 4467987, end: 4468564 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Seoul", start: 4468564, end: 4469181 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Shanghai", start: 4469181, end: 4469742 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Singapore", start: 4469742, end: 4470157 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Srednekolymsk", start: 4470157, end: 4471365 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Taipei", start: 4471365, end: 4472126 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Tashkent", start: 4472126, end: 4472717 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Tbilisi", start: 4472717, end: 4473752 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Tehran", start: 4473752, end: 4475014 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Tel_Aviv", start: 4475014, end: 4477402 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Thimbu", start: 4477402, end: 4477605 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Thimphu", start: 4477605, end: 4477808 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Tokyo", start: 4477808, end: 4478117 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Tomsk", start: 4478117, end: 4479338 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Ujung_Pandang", start: 4479338, end: 4479592 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Ulaanbaatar", start: 4479592, end: 4480483 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Ulan_Bator", start: 4480483, end: 4481374 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Urumqi", start: 4481374, end: 4481539 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Ust-Nera", start: 4481539, end: 4482791 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Vientiane", start: 4482791, end: 4482990 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Vladivostok", start: 4482990, end: 4484198 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Yakutsk", start: 4484198, end: 4485405 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Yangon", start: 4485405, end: 4485673 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Yekaterinburg", start: 4485673, end: 4486916 }, { filename: "/tmp/pglite/share/postgresql/timezone/Asia/Yerevan", start: 4486916, end: 4488067 }, { filename: "/tmp/pglite/share/postgresql/timezone/Atlantic/Azores", start: 4488067, end: 4491523 }, { filename: "/tmp/pglite/share/postgresql/timezone/Atlantic/Bermuda", start: 4491523, end: 4493919 }, { filename: "/tmp/pglite/share/postgresql/timezone/Atlantic/Canary", start: 4493919, end: 4495816 }, { filename: "/tmp/pglite/share/postgresql/timezone/Atlantic/Cape_Verde", start: 4495816, end: 4496086 }, { filename: "/tmp/pglite/share/postgresql/timezone/Atlantic/Faeroe", start: 4496086, end: 4497901 }, { filename: "/tmp/pglite/share/postgresql/timezone/Atlantic/Faroe", start: 4497901, end: 4499716 }, { filename: "/tmp/pglite/share/postgresql/timezone/Atlantic/Jan_Mayen", start: 4499716, end: 4502014 }, { filename: "/tmp/pglite/share/postgresql/timezone/Atlantic/Madeira", start: 4502014, end: 4505391 }, { filename: "/tmp/pglite/share/postgresql/timezone/Atlantic/Reykjavik", start: 4505391, end: 4505539 }, { filename: "/tmp/pglite/share/postgresql/timezone/Atlantic/South_Georgia", start: 4505539, end: 4505703 }, { filename: "/tmp/pglite/share/postgresql/timezone/Atlantic/St_Helena", start: 4505703, end: 4505851 }, { filename: "/tmp/pglite/share/postgresql/timezone/Atlantic/Stanley", start: 4505851, end: 4507065 }, { filename: "/tmp/pglite/share/postgresql/timezone/Australia/ACT", start: 4507065, end: 4509255 }, { filename: "/tmp/pglite/share/postgresql/timezone/Australia/Adelaide", start: 4509255, end: 4511463 }, { filename: "/tmp/pglite/share/postgresql/timezone/Australia/Brisbane", start: 4511463, end: 4511882 }, { filename: "/tmp/pglite/share/postgresql/timezone/Australia/Broken_Hill", start: 4511882, end: 4514111 }, { filename: "/tmp/pglite/share/postgresql/timezone/Australia/Canberra", start: 4514111, end: 4516301 }, { filename: "/tmp/pglite/share/postgresql/timezone/Australia/Currie", start: 4516301, end: 4518659 }, { filename: "/tmp/pglite/share/postgresql/timezone/Australia/Darwin", start: 4518659, end: 4518984 }, { filename: "/tmp/pglite/share/postgresql/timezone/Australia/Eucla", start: 4518984, end: 4519454 }, { filename: "/tmp/pglite/share/postgresql/timezone/Australia/Hobart", start: 4519454, end: 4521812 }, { filename: "/tmp/pglite/share/postgresql/timezone/Australia/LHI", start: 4521812, end: 4523672 }, { filename: "/tmp/pglite/share/postgresql/timezone/Australia/Lindeman", start: 4523672, end: 4524147 }, { filename: "/tmp/pglite/share/postgresql/timezone/Australia/Lord_Howe", start: 4524147, end: 4526007 }, { filename: "/tmp/pglite/share/postgresql/timezone/Australia/Melbourne", start: 4526007, end: 4528197 }, { filename: "/tmp/pglite/share/postgresql/timezone/Australia/NSW", start: 4528197, end: 4530387 }, { filename: "/tmp/pglite/share/postgresql/timezone/Australia/North", start: 4530387, end: 4530712 }, { filename: "/tmp/pglite/share/postgresql/timezone/Australia/Perth", start: 4530712, end: 4531158 }, { filename: "/tmp/pglite/share/postgresql/timezone/Australia/Queensland", start: 4531158, end: 4531577 }, { filename: "/tmp/pglite/share/postgresql/timezone/Australia/South", start: 4531577, end: 4533785 }, { filename: "/tmp/pglite/share/postgresql/timezone/Australia/Sydney", start: 4533785, end: 4535975 }, { filename: "/tmp/pglite/share/postgresql/timezone/Australia/Tasmania", start: 4535975, end: 4538333 }, { filename: "/tmp/pglite/share/postgresql/timezone/Australia/Victoria", start: 4538333, end: 4540523 }, { filename: "/tmp/pglite/share/postgresql/timezone/Australia/West", start: 4540523, end: 4540969 }, { filename: "/tmp/pglite/share/postgresql/timezone/Australia/Yancowinna", start: 4540969, end: 4543198 }, { filename: "/tmp/pglite/share/postgresql/timezone/Brazil/Acre", start: 4543198, end: 4543826 }, { filename: "/tmp/pglite/share/postgresql/timezone/Brazil/DeNoronha", start: 4543826, end: 4544542 }, { filename: "/tmp/pglite/share/postgresql/timezone/Brazil/East", start: 4544542, end: 4545986 }, { filename: "/tmp/pglite/share/postgresql/timezone/Brazil/West", start: 4545986, end: 4546590 }, { filename: "/tmp/pglite/share/postgresql/timezone/CET", start: 4546590, end: 4549523 }, { filename: "/tmp/pglite/share/postgresql/timezone/CST6CDT", start: 4549523, end: 4553115 }, { filename: "/tmp/pglite/share/postgresql/timezone/Canada/Atlantic", start: 4553115, end: 4556539 }, { filename: "/tmp/pglite/share/postgresql/timezone/Canada/Central", start: 4556539, end: 4559407 }, { filename: "/tmp/pglite/share/postgresql/timezone/Canada/Eastern", start: 4559407, end: 4562901 }, { filename: "/tmp/pglite/share/postgresql/timezone/Canada/Mountain", start: 4562901, end: 4565233 }, { filename: "/tmp/pglite/share/postgresql/timezone/Canada/Newfoundland", start: 4565233, end: 4568888 }, { filename: "/tmp/pglite/share/postgresql/timezone/Canada/Pacific", start: 4568888, end: 4571780 }, { filename: "/tmp/pglite/share/postgresql/timezone/Canada/Saskatchewan", start: 4571780, end: 4572760 }, { filename: "/tmp/pglite/share/postgresql/timezone/Canada/Yukon", start: 4572760, end: 4574374 }, { filename: "/tmp/pglite/share/postgresql/timezone/Chile/Continental", start: 4574374, end: 4576903 }, { filename: "/tmp/pglite/share/postgresql/timezone/Chile/EasterIsland", start: 4576903, end: 4579136 }, { filename: "/tmp/pglite/share/postgresql/timezone/Cuba", start: 4579136, end: 4581552 }, { filename: "/tmp/pglite/share/postgresql/timezone/EET", start: 4581552, end: 4583814 }, { filename: "/tmp/pglite/share/postgresql/timezone/EST", start: 4583814, end: 4583996 }, { filename: "/tmp/pglite/share/postgresql/timezone/EST5EDT", start: 4583996, end: 4587548 }, { filename: "/tmp/pglite/share/postgresql/timezone/Egypt", start: 4587548, end: 4589947 }, { filename: "/tmp/pglite/share/postgresql/timezone/Eire", start: 4589947, end: 4593439 }, { filename: "/tmp/pglite/share/postgresql/timezone/Etc/GMT", start: 4593439, end: 4593553 }, { filename: "/tmp/pglite/share/postgresql/timezone/Etc/GMT+0", start: 4593553, end: 4593667 }, { filename: "/tmp/pglite/share/postgresql/timezone/Etc/GMT+1", start: 4593667, end: 4593783 }, { filename: "/tmp/pglite/share/postgresql/timezone/Etc/GMT+10", start: 4593783, end: 4593900 }, { filename: "/tmp/pglite/share/postgresql/timezone/Etc/GMT+11", start: 4593900, end: 4594017 }, { filename: "/tmp/pglite/share/postgresql/timezone/Etc/GMT+12", start: 4594017, end: 4594134 }, { filename: "/tmp/pglite/share/postgresql/timezone/Etc/GMT+2", start: 4594134, end: 4594250 }, { filename: "/tmp/pglite/share/postgresql/timezone/Etc/GMT+3", start: 4594250, end: 4594366 }, { filename: "/tmp/pglite/share/postgresql/timezone/Etc/GMT+4", start: 4594366, end: 4594482 }, { filename: "/tmp/pglite/share/postgresql/timezone/Etc/GMT+5", start: 4594482, end: 4594598 }, { filename: "/tmp/pglite/share/postgresql/timezone/Etc/GMT+6", start: 4594598, end: 4594714 }, { filename: "/tmp/pglite/share/postgresql/timezone/Etc/GMT+7", start: 4594714, end: 4594830 }, { filename: "/tmp/pglite/share/postgresql/timezone/Etc/GMT+8", start: 4594830, end: 4594946 }, { filename: "/tmp/pglite/share/postgresql/timezone/Etc/GMT+9", start: 4594946, end: 4595062 }, { filename: "/tmp/pglite/share/postgresql/timezone/Etc/GMT-0", start: 4595062, end: 4595176 }, { filename: "/tmp/pglite/share/postgresql/timezone/Etc/GMT-1", start: 4595176, end: 4595293 }, { filename: "/tmp/pglite/share/postgresql/timezone/Etc/GMT-10", start: 4595293, end: 4595411 }, { filename: "/tmp/pglite/share/postgresql/timezone/Etc/GMT-11", start: 4595411, end: 4595529 }, { filename: "/tmp/pglite/share/postgresql/timezone/Etc/GMT-12", start: 4595529, end: 4595647 }, { filename: "/tmp/pglite/share/postgresql/timezone/Etc/GMT-13", start: 4595647, end: 4595765 }, { filename: "/tmp/pglite/share/postgresql/timezone/Etc/GMT-14", start: 4595765, end: 4595883 }, { filename: "/tmp/pglite/share/postgresql/timezone/Etc/GMT-2", start: 4595883, end: 4596000 }, { filename: "/tmp/pglite/share/postgresql/timezone/Etc/GMT-3", start: 4596000, end: 4596117 }, { filename: "/tmp/pglite/share/postgresql/timezone/Etc/GMT-4", start: 4596117, end: 4596234 }, { filename: "/tmp/pglite/share/postgresql/timezone/Etc/GMT-5", start: 4596234, end: 4596351 }, { filename: "/tmp/pglite/share/postgresql/timezone/Etc/GMT-6", start: 4596351, end: 4596468 }, { filename: "/tmp/pglite/share/postgresql/timezone/Etc/GMT-7", start: 4596468, end: 4596585 }, { filename: "/tmp/pglite/share/postgresql/timezone/Etc/GMT-8", start: 4596585, end: 4596702 }, { filename: "/tmp/pglite/share/postgresql/timezone/Etc/GMT-9", start: 4596702, end: 4596819 }, { filename: "/tmp/pglite/share/postgresql/timezone/Etc/GMT0", start: 4596819, end: 4596933 }, { filename: "/tmp/pglite/share/postgresql/timezone/Etc/Greenwich", start: 4596933, end: 4597047 }, { filename: "/tmp/pglite/share/postgresql/timezone/Etc/UCT", start: 4597047, end: 4597161 }, { filename: "/tmp/pglite/share/postgresql/timezone/Etc/UTC", start: 4597161, end: 4597275 }, { filename: "/tmp/pglite/share/postgresql/timezone/Etc/Universal", start: 4597275, end: 4597389 }, { filename: "/tmp/pglite/share/postgresql/timezone/Etc/Zulu", start: 4597389, end: 4597503 }, { filename: "/tmp/pglite/share/postgresql/timezone/Europe/Amsterdam", start: 4597503, end: 4600436 }, { filename: "/tmp/pglite/share/postgresql/timezone/Europe/Andorra", start: 4600436, end: 4602178 }, { filename: "/tmp/pglite/share/postgresql/timezone/Europe/Astrakhan", start: 4602178, end: 4603343 }, { filename: "/tmp/pglite/share/postgresql/timezone/Europe/Athens", start: 4603343, end: 4605605 }, { filename: "/tmp/pglite/share/postgresql/timezone/Europe/Belfast", start: 4605605, end: 4609269 }, { filename: "/tmp/pglite/share/postgresql/timezone/Europe/Belgrade", start: 4609269, end: 4611189 }, { filename: "/tmp/pglite/share/postgresql/timezone/Europe/Berlin", start: 4611189, end: 4613487 }, { filename: "/tmp/pglite/share/postgresql/timezone/Europe/Bratislava", start: 4613487, end: 4615788 }, { filename: "/tmp/pglite/share/postgresql/timezone/Europe/Brussels", start: 4615788, end: 4618721 }, { filename: "/tmp/pglite/share/postgresql/timezone/Europe/Bucharest", start: 4618721, end: 4620905 }, { filename: "/tmp/pglite/share/postgresql/timezone/Europe/Budapest", start: 4620905, end: 4623273 }, { filename: "/tmp/pglite/share/postgresql/timezone/Europe/Busingen", start: 4623273, end: 4625182 }, { filename: "/tmp/pglite/share/postgresql/timezone/Europe/Chisinau", start: 4625182, end: 4627572 }, { filename: "/tmp/pglite/share/postgresql/timezone/Europe/Copenhagen", start: 4627572, end: 4629870 }, { filename: "/tmp/pglite/share/postgresql/timezone/Europe/Dublin", start: 4629870, end: 4633362 }, { filename: "/tmp/pglite/share/postgresql/timezone/Europe/Gibraltar", start: 4633362, end: 4636430 }, { filename: "/tmp/pglite/share/postgresql/timezone/Europe/Guernsey", start: 4636430, end: 4640094 }, { filename: "/tmp/pglite/share/postgresql/timezone/Europe/Helsinki", start: 4640094, end: 4641994 }, { filename: "/tmp/pglite/share/postgresql/timezone/Europe/Isle_of_Man", start: 4641994, end: 4645658 }, { filename: "/tmp/pglite/share/postgresql/timezone/Europe/Istanbul", start: 4645658, end: 4647605 }, { filename: "/tmp/pglite/share/postgresql/timezone/Europe/Jersey", start: 4647605, end: 4651269 }, { filename: "/tmp/pglite/share/postgresql/timezone/Europe/Kaliningrad", start: 4651269, end: 4652762 }, { filename: "/tmp/pglite/share/postgresql/timezone/Europe/Kiev", start: 4652762, end: 4654882 }, { filename: "/tmp/pglite/share/postgresql/timezone/Europe/Kirov", start: 4654882, end: 4656067 }, { filename: "/tmp/pglite/share/postgresql/timezone/Europe/Kyiv", start: 4656067, end: 4658187 }, { filename: "/tmp/pglite/share/postgresql/timezone/Europe/Lisbon", start: 4658187, end: 4661714 }, { filename: "/tmp/pglite/share/postgresql/timezone/Europe/Ljubljana", start: 4661714, end: 4663634 }, { filename: "/tmp/pglite/share/postgresql/timezone/Europe/London", start: 4663634, end: 4667298 }, { filename: "/tmp/pglite/share/postgresql/timezone/Europe/Luxembourg", start: 4667298, end: 4670231 }, { filename: "/tmp/pglite/share/postgresql/timezone/Europe/Madrid", start: 4670231, end: 4672845 }, { filename: "/tmp/pglite/share/postgresql/timezone/Europe/Malta", start: 4672845, end: 4675465 }, { filename: "/tmp/pglite/share/postgresql/timezone/Europe/Mariehamn", start: 4675465, end: 4677365 }, { filename: "/tmp/pglite/share/postgresql/timezone/Europe/Minsk", start: 4677365, end: 4678686 }, { filename: "/tmp/pglite/share/postgresql/timezone/Europe/Monaco", start: 4678686, end: 4681648 }, { filename: "/tmp/pglite/share/postgresql/timezone/Europe/Moscow", start: 4681648, end: 4683183 }, { filename: "/tmp/pglite/share/postgresql/timezone/Europe/Nicosia", start: 4683183, end: 4685185 }, { filename: "/tmp/pglite/share/postgresql/timezone/Europe/Oslo", start: 4685185, end: 4687483 }, { filename: "/tmp/pglite/share/postgresql/timezone/Europe/Paris", start: 4687483, end: 4690445 }, { filename: "/tmp/pglite/share/postgresql/timezone/Europe/Podgorica", start: 4690445, end: 4692365 }, { filename: "/tmp/pglite/share/postgresql/timezone/Europe/Prague", start: 4692365, end: 4694666 }, { filename: "/tmp/pglite/share/postgresql/timezone/Europe/Riga", start: 4694666, end: 4696864 }, { filename: "/tmp/pglite/share/postgresql/timezone/Europe/Rome", start: 4696864, end: 4699505 }, { filename: "/tmp/pglite/share/postgresql/timezone/Europe/Samara", start: 4699505, end: 4700720 }, { filename: "/tmp/pglite/share/postgresql/timezone/Europe/San_Marino", start: 4700720, end: 4703361 }, { filename: "/tmp/pglite/share/postgresql/timezone/Europe/Sarajevo", start: 4703361, end: 4705281 }, { filename: "/tmp/pglite/share/postgresql/timezone/Europe/Saratov", start: 4705281, end: 4706464 }, { filename: "/tmp/pglite/share/postgresql/timezone/Europe/Simferopol", start: 4706464, end: 4707933 }, { filename: "/tmp/pglite/share/postgresql/timezone/Europe/Skopje", start: 4707933, end: 4709853 }, { filename: "/tmp/pglite/share/postgresql/timezone/Europe/Sofia", start: 4709853, end: 4711930 }, { filename: "/tmp/pglite/share/postgresql/timezone/Europe/Stockholm", start: 4711930, end: 4714228 }, { filename: "/tmp/pglite/share/postgresql/timezone/Europe/Tallinn", start: 4714228, end: 4716376 }, { filename: "/tmp/pglite/share/postgresql/timezone/Europe/Tirane", start: 4716376, end: 4718460 }, { filename: "/tmp/pglite/share/postgresql/timezone/Europe/Tiraspol", start: 4718460, end: 4720850 }, { filename: "/tmp/pglite/share/postgresql/timezone/Europe/Ulyanovsk", start: 4720850, end: 4722117 }, { filename: "/tmp/pglite/share/postgresql/timezone/Europe/Uzhgorod", start: 4722117, end: 4724237 }, { filename: "/tmp/pglite/share/postgresql/timezone/Europe/Vaduz", start: 4724237, end: 4726146 }, { filename: "/tmp/pglite/share/postgresql/timezone/Europe/Vatican", start: 4726146, end: 4728787 }, { filename: "/tmp/pglite/share/postgresql/timezone/Europe/Vienna", start: 4728787, end: 4730987 }, { filename: "/tmp/pglite/share/postgresql/timezone/Europe/Vilnius", start: 4730987, end: 4733149 }, { filename: "/tmp/pglite/share/postgresql/timezone/Europe/Volgograd", start: 4733149, end: 4734342 }, { filename: "/tmp/pglite/share/postgresql/timezone/Europe/Warsaw", start: 4734342, end: 4736996 }, { filename: "/tmp/pglite/share/postgresql/timezone/Europe/Zagreb", start: 4736996, end: 4738916 }, { filename: "/tmp/pglite/share/postgresql/timezone/Europe/Zaporozhye", start: 4738916, end: 4741036 }, { filename: "/tmp/pglite/share/postgresql/timezone/Europe/Zurich", start: 4741036, end: 4742945 }, { filename: "/tmp/pglite/share/postgresql/timezone/Factory", start: 4742945, end: 4743061 }, { filename: "/tmp/pglite/share/postgresql/timezone/GB", start: 4743061, end: 4746725 }, { filename: "/tmp/pglite/share/postgresql/timezone/GB-Eire", start: 4746725, end: 4750389 }, { filename: "/tmp/pglite/share/postgresql/timezone/GMT", start: 4750389, end: 4750503 }, { filename: "/tmp/pglite/share/postgresql/timezone/GMT+0", start: 4750503, end: 4750617 }, { filename: "/tmp/pglite/share/postgresql/timezone/GMT-0", start: 4750617, end: 4750731 }, { filename: "/tmp/pglite/share/postgresql/timezone/GMT0", start: 4750731, end: 4750845 }, { filename: "/tmp/pglite/share/postgresql/timezone/Greenwich", start: 4750845, end: 4750959 }, { filename: "/tmp/pglite/share/postgresql/timezone/HST", start: 4750959, end: 4751288 }, { filename: "/tmp/pglite/share/postgresql/timezone/Hongkong", start: 4751288, end: 4752521 }, { filename: "/tmp/pglite/share/postgresql/timezone/Iceland", start: 4752521, end: 4752669 }, { filename: "/tmp/pglite/share/postgresql/timezone/Indian/Antananarivo", start: 4752669, end: 4752934 }, { filename: "/tmp/pglite/share/postgresql/timezone/Indian/Chagos", start: 4752934, end: 4753133 }, { filename: "/tmp/pglite/share/postgresql/timezone/Indian/Christmas", start: 4753133, end: 4753332 }, { filename: "/tmp/pglite/share/postgresql/timezone/Indian/Cocos", start: 4753332, end: 4753600 }, { filename: "/tmp/pglite/share/postgresql/timezone/Indian/Comoro", start: 4753600, end: 4753865 }, { filename: "/tmp/pglite/share/postgresql/timezone/Indian/Kerguelen", start: 4753865, end: 4754064 }, { filename: "/tmp/pglite/share/postgresql/timezone/Indian/Mahe", start: 4754064, end: 4754229 }, { filename: "/tmp/pglite/share/postgresql/timezone/Indian/Maldives", start: 4754229, end: 4754428 }, { filename: "/tmp/pglite/share/postgresql/timezone/Indian/Mauritius", start: 4754428, end: 4754669 }, { filename: "/tmp/pglite/share/postgresql/timezone/Indian/Mayotte", start: 4754669, end: 4754934 }, { filename: "/tmp/pglite/share/postgresql/timezone/Indian/Reunion", start: 4754934, end: 4755099 }, { filename: "/tmp/pglite/share/postgresql/timezone/Iran", start: 4755099, end: 4756361 }, { filename: "/tmp/pglite/share/postgresql/timezone/Israel", start: 4756361, end: 4758749 }, { filename: "/tmp/pglite/share/postgresql/timezone/Jamaica", start: 4758749, end: 4759231 }, { filename: "/tmp/pglite/share/postgresql/timezone/Japan", start: 4759231, end: 4759540 }, { filename: "/tmp/pglite/share/postgresql/timezone/Kwajalein", start: 4759540, end: 4759856 }, { filename: "/tmp/pglite/share/postgresql/timezone/Libya", start: 4759856, end: 4760481 }, { filename: "/tmp/pglite/share/postgresql/timezone/MET", start: 4760481, end: 4763414 }, { filename: "/tmp/pglite/share/postgresql/timezone/MST", start: 4763414, end: 4763774 }, { filename: "/tmp/pglite/share/postgresql/timezone/MST7MDT", start: 4763774, end: 4766234 }, { filename: "/tmp/pglite/share/postgresql/timezone/Mexico/BajaNorte", start: 4766234, end: 4768692 }, { filename: "/tmp/pglite/share/postgresql/timezone/Mexico/BajaSur", start: 4768692, end: 4769752 }, { filename: "/tmp/pglite/share/postgresql/timezone/Mexico/General", start: 4769752, end: 4770974 }, { filename: "/tmp/pglite/share/postgresql/timezone/NZ", start: 4770974, end: 4773411 }, { filename: "/tmp/pglite/share/postgresql/timezone/NZ-CHAT", start: 4773411, end: 4775479 }, { filename: "/tmp/pglite/share/postgresql/timezone/Navajo", start: 4775479, end: 4777939 }, { filename: "/tmp/pglite/share/postgresql/timezone/PRC", start: 4777939, end: 4778500 }, { filename: "/tmp/pglite/share/postgresql/timezone/PST8PDT", start: 4778500, end: 4781352 }, { filename: "/tmp/pglite/share/postgresql/timezone/Pacific/Apia", start: 4781352, end: 4781964 }, { filename: "/tmp/pglite/share/postgresql/timezone/Pacific/Auckland", start: 4781964, end: 4784401 }, { filename: "/tmp/pglite/share/postgresql/timezone/Pacific/Bougainville", start: 4784401, end: 4784669 }, { filename: "/tmp/pglite/share/postgresql/timezone/Pacific/Chatham", start: 4784669, end: 4786737 }, { filename: "/tmp/pglite/share/postgresql/timezone/Pacific/Chuuk", start: 4786737, end: 4786923 }, { filename: "/tmp/pglite/share/postgresql/timezone/Pacific/Easter", start: 4786923, end: 4789156 }, { filename: "/tmp/pglite/share/postgresql/timezone/Pacific/Efate", start: 4789156, end: 4789694 }, { filename: "/tmp/pglite/share/postgresql/timezone/Pacific/Enderbury", start: 4789694, end: 4789928 }, { filename: "/tmp/pglite/share/postgresql/timezone/Pacific/Fakaofo", start: 4789928, end: 4790128 }, { filename: "/tmp/pglite/share/postgresql/timezone/Pacific/Fiji", start: 4790128, end: 4790706 }, { filename: "/tmp/pglite/share/postgresql/timezone/Pacific/Funafuti", start: 4790706, end: 4790872 }, { filename: "/tmp/pglite/share/postgresql/timezone/Pacific/Galapagos", start: 4790872, end: 4791110 }, { filename: "/tmp/pglite/share/postgresql/timezone/Pacific/Gambier", start: 4791110, end: 4791274 }, { filename: "/tmp/pglite/share/postgresql/timezone/Pacific/Guadalcanal", start: 4791274, end: 4791440 }, { filename: "/tmp/pglite/share/postgresql/timezone/Pacific/Guam", start: 4791440, end: 4791934 }, { filename: "/tmp/pglite/share/postgresql/timezone/Pacific/Honolulu", start: 4791934, end: 4792263 }, { filename: "/tmp/pglite/share/postgresql/timezone/Pacific/Johnston", start: 4792263, end: 4792592 }, { filename: "/tmp/pglite/share/postgresql/timezone/Pacific/Kanton", start: 4792592, end: 4792826 }, { filename: "/tmp/pglite/share/postgresql/timezone/Pacific/Kiritimati", start: 4792826, end: 4793064 }, { filename: "/tmp/pglite/share/postgresql/timezone/Pacific/Kosrae", start: 4793064, end: 4793415 }, { filename: "/tmp/pglite/share/postgresql/timezone/Pacific/Kwajalein", start: 4793415, end: 4793731 }, { filename: "/tmp/pglite/share/postgresql/timezone/Pacific/Majuro", start: 4793731, end: 4793897 }, { filename: "/tmp/pglite/share/postgresql/timezone/Pacific/Marquesas", start: 4793897, end: 4794070 }, { filename: "/tmp/pglite/share/postgresql/timezone/Pacific/Midway", start: 4794070, end: 4794245 }, { filename: "/tmp/pglite/share/postgresql/timezone/Pacific/Nauru", start: 4794245, end: 4794497 }, { filename: "/tmp/pglite/share/postgresql/timezone/Pacific/Niue", start: 4794497, end: 4794700 }, { filename: "/tmp/pglite/share/postgresql/timezone/Pacific/Norfolk", start: 4794700, end: 4795580 }, { filename: "/tmp/pglite/share/postgresql/timezone/Pacific/Noumea", start: 4795580, end: 4795884 }, { filename: "/tmp/pglite/share/postgresql/timezone/Pacific/Pago_Pago", start: 4795884, end: 4796059 }, { filename: "/tmp/pglite/share/postgresql/timezone/Pacific/Palau", start: 4796059, end: 4796239 }, { filename: "/tmp/pglite/share/postgresql/timezone/Pacific/Pitcairn", start: 4796239, end: 4796441 }, { filename: "/tmp/pglite/share/postgresql/timezone/Pacific/Pohnpei", start: 4796441, end: 4796607 }, { filename: "/tmp/pglite/share/postgresql/timezone/Pacific/Ponape", start: 4796607, end: 4796773 }, { filename: "/tmp/pglite/share/postgresql/timezone/Pacific/Port_Moresby", start: 4796773, end: 4796959 }, { filename: "/tmp/pglite/share/postgresql/timezone/Pacific/Rarotonga", start: 4796959, end: 4797562 }, { filename: "/tmp/pglite/share/postgresql/timezone/Pacific/Saipan", start: 4797562, end: 4798056 }, { filename: "/tmp/pglite/share/postgresql/timezone/Pacific/Samoa", start: 4798056, end: 4798231 }, { filename: "/tmp/pglite/share/postgresql/timezone/Pacific/Tahiti", start: 4798231, end: 4798396 }, { filename: "/tmp/pglite/share/postgresql/timezone/Pacific/Tarawa", start: 4798396, end: 4798562 }, { filename: "/tmp/pglite/share/postgresql/timezone/Pacific/Tongatapu", start: 4798562, end: 4798934 }, { filename: "/tmp/pglite/share/postgresql/timezone/Pacific/Truk", start: 4798934, end: 4799120 }, { filename: "/tmp/pglite/share/postgresql/timezone/Pacific/Wake", start: 4799120, end: 4799286 }, { filename: "/tmp/pglite/share/postgresql/timezone/Pacific/Wallis", start: 4799286, end: 4799452 }, { filename: "/tmp/pglite/share/postgresql/timezone/Pacific/Yap", start: 4799452, end: 4799638 }, { filename: "/tmp/pglite/share/postgresql/timezone/Poland", start: 4799638, end: 4802292 }, { filename: "/tmp/pglite/share/postgresql/timezone/Portugal", start: 4802292, end: 4805819 }, { filename: "/tmp/pglite/share/postgresql/timezone/ROC", start: 4805819, end: 4806580 }, { filename: "/tmp/pglite/share/postgresql/timezone/ROK", start: 4806580, end: 4807197 }, { filename: "/tmp/pglite/share/postgresql/timezone/Singapore", start: 4807197, end: 4807612 }, { filename: "/tmp/pglite/share/postgresql/timezone/Turkey", start: 4807612, end: 4809559 }, { filename: "/tmp/pglite/share/postgresql/timezone/UCT", start: 4809559, end: 4809673 }, { filename: "/tmp/pglite/share/postgresql/timezone/US/Alaska", start: 4809673, end: 4812044 }, { filename: "/tmp/pglite/share/postgresql/timezone/US/Aleutian", start: 4812044, end: 4814400 }, { filename: "/tmp/pglite/share/postgresql/timezone/US/Arizona", start: 4814400, end: 4814760 }, { filename: "/tmp/pglite/share/postgresql/timezone/US/Central", start: 4814760, end: 4818352 }, { filename: "/tmp/pglite/share/postgresql/timezone/US/East-Indiana", start: 4818352, end: 4820034 }, { filename: "/tmp/pglite/share/postgresql/timezone/US/Eastern", start: 4820034, end: 4823586 }, { filename: "/tmp/pglite/share/postgresql/timezone/US/Hawaii", start: 4823586, end: 4823915 }, { filename: "/tmp/pglite/share/postgresql/timezone/US/Indiana-Starke", start: 4823915, end: 4826359 }, { filename: "/tmp/pglite/share/postgresql/timezone/US/Michigan", start: 4826359, end: 4828589 }, { filename: "/tmp/pglite/share/postgresql/timezone/US/Mountain", start: 4828589, end: 4831049 }, { filename: "/tmp/pglite/share/postgresql/timezone/US/Pacific", start: 4831049, end: 4833901 }, { filename: "/tmp/pglite/share/postgresql/timezone/US/Samoa", start: 4833901, end: 4834076 }, { filename: "/tmp/pglite/share/postgresql/timezone/UTC", start: 4834076, end: 4834190 }, { filename: "/tmp/pglite/share/postgresql/timezone/Universal", start: 4834190, end: 4834304 }, { filename: "/tmp/pglite/share/postgresql/timezone/W-SU", start: 4834304, end: 4835839 }, { filename: "/tmp/pglite/share/postgresql/timezone/WET", start: 4835839, end: 4839366 }, { filename: "/tmp/pglite/share/postgresql/timezone/Zulu", start: 4839366, end: 4839480 }, { filename: "/tmp/pglite/share/postgresql/timezonesets/Africa.txt", start: 4839480, end: 4846453 }, { filename: "/tmp/pglite/share/postgresql/timezonesets/America.txt", start: 4846453, end: 4857460 }, { filename: "/tmp/pglite/share/postgresql/timezonesets/Antarctica.txt", start: 4857460, end: 4858594 }, { filename: "/tmp/pglite/share/postgresql/timezonesets/Asia.txt", start: 4858594, end: 4866905 }, { filename: "/tmp/pglite/share/postgresql/timezonesets/Atlantic.txt", start: 4866905, end: 4870438 }, { filename: "/tmp/pglite/share/postgresql/timezonesets/Australia", start: 4870438, end: 4871573 }, { filename: "/tmp/pglite/share/postgresql/timezonesets/Australia.txt", start: 4871573, end: 4874957 }, { filename: "/tmp/pglite/share/postgresql/timezonesets/Default", start: 4874957, end: 4902171 }, { filename: "/tmp/pglite/share/postgresql/timezonesets/Etc.txt", start: 4902171, end: 4903421 }, { filename: "/tmp/pglite/share/postgresql/timezonesets/Europe.txt", start: 4903421, end: 4912167 }, { filename: "/tmp/pglite/share/postgresql/timezonesets/India", start: 4912167, end: 4912760 }, { filename: "/tmp/pglite/share/postgresql/timezonesets/Indian.txt", start: 4912760, end: 4914021 }, { filename: "/tmp/pglite/share/postgresql/timezonesets/Pacific.txt", start: 4914021, end: 4917789 }, { filename: "/tmp/pglite/share/postgresql/tsearch_data/danish.stop", start: 4917789, end: 4918213 }, { filename: "/tmp/pglite/share/postgresql/tsearch_data/dutch.stop", start: 4918213, end: 4918666 }, { filename: "/tmp/pglite/share/postgresql/tsearch_data/english.stop", start: 4918666, end: 4919288 }, { filename: "/tmp/pglite/share/postgresql/tsearch_data/finnish.stop", start: 4919288, end: 4920867 }, { filename: "/tmp/pglite/share/postgresql/tsearch_data/french.stop", start: 4920867, end: 4921672 }, { filename: "/tmp/pglite/share/postgresql/tsearch_data/german.stop", start: 4921672, end: 4923021 }, { filename: "/tmp/pglite/share/postgresql/tsearch_data/hungarian.stop", start: 4923021, end: 4924248 }, { filename: "/tmp/pglite/share/postgresql/tsearch_data/hunspell_sample.affix", start: 4924248, end: 4924491 }, { filename: "/tmp/pglite/share/postgresql/tsearch_data/hunspell_sample_long.affix", start: 4924491, end: 4925124 }, { filename: "/tmp/pglite/share/postgresql/tsearch_data/hunspell_sample_long.dict", start: 4925124, end: 4925222 }, { filename: "/tmp/pglite/share/postgresql/tsearch_data/hunspell_sample_num.affix", start: 4925222, end: 4925684 }, { filename: "/tmp/pglite/share/postgresql/tsearch_data/hunspell_sample_num.dict", start: 4925684, end: 4925813 }, { filename: "/tmp/pglite/share/postgresql/tsearch_data/ispell_sample.affix", start: 4925813, end: 4926278 }, { filename: "/tmp/pglite/share/postgresql/tsearch_data/ispell_sample.dict", start: 4926278, end: 4926359 }, { filename: "/tmp/pglite/share/postgresql/tsearch_data/italian.stop", start: 4926359, end: 4928013 }, { filename: "/tmp/pglite/share/postgresql/tsearch_data/nepali.stop", start: 4928013, end: 4932274 }, { filename: "/tmp/pglite/share/postgresql/tsearch_data/norwegian.stop", start: 4932274, end: 4933125 }, { filename: "/tmp/pglite/share/postgresql/tsearch_data/portuguese.stop", start: 4933125, end: 4934392 }, { filename: "/tmp/pglite/share/postgresql/tsearch_data/russian.stop", start: 4934392, end: 4935627 }, { filename: "/tmp/pglite/share/postgresql/tsearch_data/spanish.stop", start: 4935627, end: 4937805 }, { filename: "/tmp/pglite/share/postgresql/tsearch_data/swedish.stop", start: 4937805, end: 4938364 }, { filename: "/tmp/pglite/share/postgresql/tsearch_data/synonym_sample.syn", start: 4938364, end: 4938437 }, { filename: "/tmp/pglite/share/postgresql/tsearch_data/thesaurus_sample.ths", start: 4938437, end: 4938910 }, { filename: "/tmp/pglite/share/postgresql/tsearch_data/turkish.stop", start: 4938910, end: 4939170 }], remote_package_size: 4939170 });
      })();
      var moduleOverrides = Object.assign({}, Module), arguments_ = [], thisProgram = "./this.program", quit_ = (e, t2) => {
        throw t2;
      }, scriptDirectory = "";
      function locateFile(e) {
        return Module.locateFile ? Module.locateFile(e, scriptDirectory) : scriptDirectory + e;
      }
      var readAsync, readBinary;
      if (ENVIRONMENT_IS_NODE) {
        var fs = require("fs"), nodePath = require("path");
        import.meta.url.startsWith("data:") || (scriptDirectory = nodePath.dirname(require("url").fileURLToPath(import.meta.url)) + "/"), readBinary = (e) => {
          e = isFileURI(e) ? new URL(e) : e;
          var t2 = fs.readFileSync(e);
          return t2;
        }, readAsync = async (e, t2 = true) => {
          e = isFileURI(e) ? new URL(e) : e;
          var r = fs.readFileSync(e, t2 ? undefined : "utf8");
          return r;
        }, !Module.thisProgram && process.argv.length > 1 && (thisProgram = process.argv[1].replace(/\\/g, "/")), arguments_ = process.argv.slice(2), quit_ = (e, t2) => {
          throw process.exitCode = e, t2;
        };
      } else
        (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) && (ENVIRONMENT_IS_WORKER ? scriptDirectory = self.location.href : typeof document < "u" && document.currentScript && (scriptDirectory = document.currentScript.src), _scriptName && (scriptDirectory = _scriptName), scriptDirectory.startsWith("blob:") ? scriptDirectory = "" : scriptDirectory = scriptDirectory.substr(0, scriptDirectory.replace(/[?#].*/, "").lastIndexOf("/") + 1), ENVIRONMENT_IS_WORKER && (readBinary = (e) => {
          var t2 = new XMLHttpRequest;
          return t2.open("GET", e, false), t2.responseType = "arraybuffer", t2.send(null), new Uint8Array(t2.response);
        }), readAsync = async (e) => {
          var t2 = await fetch(e, { credentials: "same-origin" });
          if (t2.ok)
            return t2.arrayBuffer();
          throw new Error(t2.status + " : " + t2.url);
        });
      var out = Module.print || console.log.bind(console), err = Module.printErr || console.error.bind(console);
      Object.assign(Module, moduleOverrides), moduleOverrides = null, Module.arguments && (arguments_ = Module.arguments), Module.thisProgram && (thisProgram = Module.thisProgram);
      var dynamicLibraries = Module.dynamicLibraries || [], wasmBinary = Module.wasmBinary;
      function intArrayFromBase64(e) {
        if (typeof ENVIRONMENT_IS_NODE < "u" && ENVIRONMENT_IS_NODE) {
          var t2 = Buffer.from(e, "base64");
          return new Uint8Array(t2.buffer, t2.byteOffset, t2.length);
        }
        for (var r = atob(e), a2 = new Uint8Array(r.length), o4 = 0;o4 < r.length; ++o4)
          a2[o4] = r.charCodeAt(o4);
        return a2;
      }
      var wasmMemory, ABORT = false, EXITSTATUS;
      function assert(e, t2) {
        e || abort(t2);
      }
      var HEAP8, HEAPU8, HEAP16, HEAPU16, HEAP32, HEAPU32, HEAPF32, HEAP64, HEAPU64, HEAPF64;
      function updateMemoryViews() {
        var e = wasmMemory.buffer;
        Module.HEAP8 = HEAP8 = new Int8Array(e), Module.HEAP16 = HEAP16 = new Int16Array(e), Module.HEAPU8 = HEAPU8 = new Uint8Array(e), Module.HEAPU16 = HEAPU16 = new Uint16Array(e), Module.HEAP32 = HEAP32 = new Int32Array(e), Module.HEAPU32 = HEAPU32 = new Uint32Array(e), Module.HEAPF32 = HEAPF32 = new Float32Array(e), Module.HEAPF64 = HEAPF64 = new Float64Array(e), Module.HEAP64 = HEAP64 = new BigInt64Array(e), Module.HEAPU64 = HEAPU64 = new BigUint64Array(e);
      }
      if (Module.wasmMemory)
        wasmMemory = Module.wasmMemory;
      else {
        var INITIAL_MEMORY = Module.INITIAL_MEMORY || 16777216;
        wasmMemory = new WebAssembly.Memory({ initial: INITIAL_MEMORY / 65536, maximum: 32768 });
      }
      updateMemoryViews();
      var __ATPRERUN__ = [], __ATINIT__ = [], __ATMAIN__ = [], __ATPOSTRUN__ = [], __RELOC_FUNCS__ = [], runtimeInitialized = false;
      function preRun() {
        if (Module.preRun)
          for (typeof Module.preRun == "function" && (Module.preRun = [Module.preRun]);Module.preRun.length; )
            addOnPreRun(Module.preRun.shift());
        callRuntimeCallbacks(__ATPRERUN__);
      }
      function initRuntime() {
        runtimeInitialized = true, callRuntimeCallbacks(__RELOC_FUNCS__), !Module.noFSInit && !FS.initialized && FS.init(), FS.ignorePermissions = false, TTY.init(), SOCKFS.root = FS.mount(SOCKFS, {}, null), PIPEFS.root = FS.mount(PIPEFS, {}, null), callRuntimeCallbacks(__ATINIT__);
      }
      function preMain() {
        callRuntimeCallbacks(__ATMAIN__);
      }
      function postRun() {
        if (Module.postRun)
          for (typeof Module.postRun == "function" && (Module.postRun = [Module.postRun]);Module.postRun.length; )
            addOnPostRun(Module.postRun.shift());
        callRuntimeCallbacks(__ATPOSTRUN__);
      }
      function addOnPreRun(e) {
        __ATPRERUN__.unshift(e);
      }
      function addOnInit(e) {
        __ATINIT__.unshift(e);
      }
      function addOnPostRun(e) {
        __ATPOSTRUN__.unshift(e);
      }
      var runDependencies = 0, dependenciesFulfilled = null;
      function getUniqueRunDependency(e) {
        return e;
      }
      function addRunDependency(e) {
        runDependencies++, Module.monitorRunDependencies?.(runDependencies);
      }
      function removeRunDependency(e) {
        if (runDependencies--, Module.monitorRunDependencies?.(runDependencies), runDependencies == 0 && dependenciesFulfilled) {
          var t2 = dependenciesFulfilled;
          dependenciesFulfilled = null, t2();
        }
      }
      function abort(e) {
        Module.onAbort?.(e), e = "Aborted(" + e + ")", err(e), ABORT = true, e += ". Build with -sASSERTIONS for more info.";
        var t2 = new WebAssembly.RuntimeError(e);
        throw readyPromiseReject(t2), t2;
      }
      var dataURIPrefix = "data:application/octet-stream;base64,", isDataURI = (e) => e.startsWith(dataURIPrefix), isFileURI = (e) => e.startsWith("file://");
      function findWasmBinary() {
        if (Module.locateFile) {
          var e = "pglite.wasm";
          return isDataURI(e) ? e : locateFile(e);
        }
        return new URL("pglite.wasm", import.meta.url).href;
      }
      var wasmBinaryFile;
      function getBinarySync(e) {
        if (e == wasmBinaryFile && wasmBinary)
          return new Uint8Array(wasmBinary);
        if (readBinary)
          return readBinary(e);
        throw "both async and sync fetching of the wasm failed";
      }
      async function getWasmBinary(e) {
        if (!wasmBinary)
          try {
            var t2 = await readAsync(e);
            return new Uint8Array(t2);
          } catch {}
        return getBinarySync(e);
      }
      async function instantiateArrayBuffer(e, t2) {
        try {
          var r = await getWasmBinary(e), a2 = await WebAssembly.instantiate(r, t2);
          return a2;
        } catch (o4) {
          err(`failed to asynchronously prepare wasm: ${o4}`), abort(o4);
        }
      }
      async function instantiateAsync(e, t2, r) {
        if (!e && typeof WebAssembly.instantiateStreaming == "function" && !isDataURI(t2) && !ENVIRONMENT_IS_NODE && typeof fetch == "function")
          try {
            var a2 = fetch(t2, { credentials: "same-origin" }), o4 = await WebAssembly.instantiateStreaming(a2, r);
            return o4;
          } catch (s4) {
            err(`wasm streaming compile failed: ${s4}`), err("falling back to ArrayBuffer instantiation");
          }
        return instantiateArrayBuffer(t2, r);
      }
      function getWasmImports() {
        return { env: wasmImports, wasi_snapshot_preview1: wasmImports, "GOT.mem": new Proxy(wasmImports, GOTHandler), "GOT.func": new Proxy(wasmImports, GOTHandler) };
      }
      async function createWasm() {
        function e(o4, s4) {
          wasmExports = o4.exports, wasmExports = relocateExports(wasmExports, 1024);
          var n3 = getDylinkMetadata(s4);
          return n3.neededDynlibs && (dynamicLibraries = n3.neededDynlibs.concat(dynamicLibraries)), mergeLibSymbols(wasmExports, "main"), LDSO.init(), loadDylibs(), addOnInit(wasmExports.__wasm_call_ctors), __RELOC_FUNCS__.push(wasmExports.__wasm_apply_data_relocs), removeRunDependency("wasm-instantiate"), wasmExports;
        }
        addRunDependency("wasm-instantiate");
        function t2(o4) {
          e(o4.instance, o4.module);
        }
        var r = getWasmImports();
        if (Module.instantiateWasm)
          try {
            return Module.instantiateWasm(r, e);
          } catch (o4) {
            err(`Module.instantiateWasm callback failed with error: ${o4}`), readyPromiseReject(o4);
          }
        wasmBinaryFile ?? (wasmBinaryFile = findWasmBinary());
        try {
          var a2 = await instantiateAsync(wasmBinary, wasmBinaryFile, r);
          return t2(a2), a2;
        } catch (o4) {
          readyPromiseReject(o4);
          return;
        }
      }
      var ASM_CONSTS = { 2537480: (e) => {
        Module.is_worker = typeof WorkerGlobalScope < "u" && self instanceof WorkerGlobalScope, Module.FD_BUFFER_MAX = e, Module.emscripten_copy_to = console.warn;
      }, 2537652: () => {
        Module.postMessage = function(t2) {
          console.log("# pg_main_emsdk.c:544: onCustomMessage:", t2);
        };
      }, 2537781: () => {
        if (Module.is_worker) {
          let t2 = function(r) {
            console.log("onCustomMessage:", r);
          };
          var e = t2;
          Module.onCustomMessage = t2;
        } else
          Module.postMessage = function(r) {
            switch (r.type) {
              case "raw":
                break;
              case "stdin": {
                stringToUTF8(r.data, 1, Module.FD_BUFFER_MAX);
                break;
              }
              case "rcon":
                break;
              default:
                console.warn("custom_postMessage?", r);
            }
          };
      } };

      class ExitStatus {
        constructor(t2) {
          P(this, "name", "ExitStatus");
          this.message = `Program terminated with exit(${t2})`, this.status = t2;
        }
      }
      var GOT = {}, currentModuleWeakSymbols = new Set([]), GOTHandler = { get(e, t2) {
        var r = GOT[t2];
        return r || (r = GOT[t2] = new WebAssembly.Global({ value: "i32", mutable: true })), currentModuleWeakSymbols.has(t2) || (r.required = true), r;
      } }, callRuntimeCallbacks = (e) => {
        for (;e.length > 0; )
          e.shift()(Module);
      }, UTF8Decoder = typeof TextDecoder < "u" ? new TextDecoder : undefined, UTF8ArrayToString = (e, t2 = 0, r = NaN) => {
        for (var a2 = t2 + r, o4 = t2;e[o4] && !(o4 >= a2); )
          ++o4;
        if (o4 - t2 > 16 && e.buffer && UTF8Decoder)
          return UTF8Decoder.decode(e.subarray(t2, o4));
        for (var s4 = "";t2 < o4; ) {
          var n3 = e[t2++];
          if (!(n3 & 128)) {
            s4 += String.fromCharCode(n3);
            continue;
          }
          var _3 = e[t2++] & 63;
          if ((n3 & 224) == 192) {
            s4 += String.fromCharCode((n3 & 31) << 6 | _3);
            continue;
          }
          var l3 = e[t2++] & 63;
          if ((n3 & 240) == 224 ? n3 = (n3 & 15) << 12 | _3 << 6 | l3 : n3 = (n3 & 7) << 18 | _3 << 12 | l3 << 6 | e[t2++] & 63, n3 < 65536)
            s4 += String.fromCharCode(n3);
          else {
            var p4 = n3 - 65536;
            s4 += String.fromCharCode(55296 | p4 >> 10, 56320 | p4 & 1023);
          }
        }
        return s4;
      }, getDylinkMetadata = (e) => {
        var t2 = 0, r = 0;
        function a2() {
          return e[t2++];
        }
        function o4() {
          for (var A2 = 0, D4 = 1;; ) {
            var T5 = e[t2++];
            if (A2 += (T5 & 127) * D4, D4 *= 128, !(T5 & 128))
              break;
          }
          return A2;
        }
        function s4() {
          var A2 = o4();
          return t2 += A2, UTF8ArrayToString(e, t2 - A2, A2);
        }
        function n3(A2, D4) {
          if (A2)
            throw new Error(D4);
        }
        var _3 = "dylink.0";
        if (e instanceof WebAssembly.Module) {
          var l3 = WebAssembly.Module.customSections(e, _3);
          l3.length === 0 && (_3 = "dylink", l3 = WebAssembly.Module.customSections(e, _3)), n3(l3.length === 0, "need dylink section"), e = new Uint8Array(l3[0]), r = e.length;
        } else {
          var p4 = new Uint32Array(new Uint8Array(e.subarray(0, 24)).buffer), m4 = p4[0] == 1836278016;
          n3(!m4, "need to see wasm magic number"), n3(e[8] !== 0, "need the dylink section to be first"), t2 = 9;
          var d2 = o4();
          r = t2 + d2, _3 = s4();
        }
        var g5 = { neededDynlibs: [], tlsExports: new Set, weakImports: new Set };
        if (_3 == "dylink") {
          g5.memorySize = o4(), g5.memoryAlign = o4(), g5.tableSize = o4(), g5.tableAlign = o4();
          for (var u2 = o4(), f3 = 0;f3 < u2; ++f3) {
            var c2 = s4();
            g5.neededDynlibs.push(c2);
          }
        } else {
          n3(_3 !== "dylink.0");
          for (var w4 = 1, x6 = 2, S3 = 3, v3 = 4, b3 = 256, M2 = 3, y4 = 1;t2 < r; ) {
            var F4 = a2(), R3 = o4();
            if (F4 === w4)
              g5.memorySize = o4(), g5.memoryAlign = o4(), g5.tableSize = o4(), g5.tableAlign = o4();
            else if (F4 === x6)
              for (var u2 = o4(), f3 = 0;f3 < u2; ++f3)
                c2 = s4(), g5.neededDynlibs.push(c2);
            else if (F4 === S3)
              for (var U3 = o4();U3--; ) {
                var ee2 = s4(), N2 = o4();
                N2 & b3 && g5.tlsExports.add(ee2);
              }
            else if (F4 === v3)
              for (var U3 = o4();U3--; ) {
                var H4 = s4(), ee2 = s4(), N2 = o4();
                (N2 & M2) == y4 && g5.weakImports.add(ee2);
              }
            else
              t2 += R3;
          }
        }
        return g5;
      };
      function getValue(e, t2 = "i8") {
        switch (t2.endsWith("*") && (t2 = "*"), t2) {
          case "i1":
            return HEAP8[e];
          case "i8":
            return HEAP8[e];
          case "i16":
            return HEAP16[e >> 1];
          case "i32":
            return HEAP32[e >> 2];
          case "i64":
            return HEAP64[e >> 3];
          case "float":
            return HEAPF32[e >> 2];
          case "double":
            return HEAPF64[e >> 3];
          case "*":
            return HEAPU32[e >> 2];
          default:
            abort(`invalid type for getValue: ${t2}`);
        }
      }
      var newDSO = (e, t2, r) => {
        var a2 = { refcount: Infinity, name: e, exports: r, global: true };
        return LDSO.loadedLibsByName[e] = a2, t2 != null && (LDSO.loadedLibsByHandle[t2] = a2), a2;
      }, LDSO = { loadedLibsByName: {}, loadedLibsByHandle: {}, init() {
        newDSO("__main__", 0, wasmImports);
      } }, ___heap_base = 2765600, alignMemory = (e, t2) => Math.ceil(e / t2) * t2, getMemory = (e) => {
        if (runtimeInitialized)
          return _calloc(e, 1);
        var t2 = ___heap_base, r = t2 + alignMemory(e, 16);
        return ___heap_base = r, GOT.__heap_base.value = r, t2;
      }, isInternalSym = (e) => ["__cpp_exception", "__c_longjmp", "__wasm_apply_data_relocs", "__dso_handle", "__tls_size", "__tls_align", "__set_stack_limits", "_emscripten_tls_init", "__wasm_init_tls", "__wasm_call_ctors", "__start_em_asm", "__stop_em_asm", "__start_em_js", "__stop_em_js"].includes(e) || e.startsWith("__em_js__"), uleb128Encode = (e, t2) => {
        e < 128 ? t2.push(e) : t2.push(e % 128 | 128, e >> 7);
      }, sigToWasmTypes = (e) => {
        for (var t2 = { i: "i32", j: "i64", f: "f32", d: "f64", e: "externref", p: "i32" }, r = { parameters: [], results: e[0] == "v" ? [] : [t2[e[0]]] }, a2 = 1;a2 < e.length; ++a2)
          r.parameters.push(t2[e[a2]]);
        return r;
      }, generateFuncType = (e, t2) => {
        var r = e.slice(0, 1), a2 = e.slice(1), o4 = { i: 127, p: 127, j: 126, f: 125, d: 124, e: 111 };
        t2.push(96), uleb128Encode(a2.length, t2);
        for (var s4 = 0;s4 < a2.length; ++s4)
          t2.push(o4[a2[s4]]);
        r == "v" ? t2.push(0) : t2.push(1, o4[r]);
      }, convertJsFunctionToWasm = (e, t2) => {
        if (typeof WebAssembly.Function == "function")
          return new WebAssembly.Function(sigToWasmTypes(t2), e);
        var r = [1];
        generateFuncType(t2, r);
        var a2 = [0, 97, 115, 109, 1, 0, 0, 0, 1];
        uleb128Encode(r.length, a2), a2.push(...r), a2.push(2, 7, 1, 1, 101, 1, 102, 0, 0, 7, 5, 1, 1, 102, 0, 0);
        var o4 = new WebAssembly.Module(new Uint8Array(a2)), s4 = new WebAssembly.Instance(o4, { e: { f: e } }), n3 = s4.exports.f;
        return n3;
      }, wasmTableMirror = [], wasmTable = new WebAssembly.Table({ initial: 5610, element: "anyfunc" }), getWasmTableEntry = (e) => {
        var t2 = wasmTableMirror[e];
        return t2 || (e >= wasmTableMirror.length && (wasmTableMirror.length = e + 1), wasmTableMirror[e] = t2 = wasmTable.get(e)), t2;
      }, updateTableMap = (e, t2) => {
        if (functionsInTableMap)
          for (var r = e;r < e + t2; r++) {
            var a2 = getWasmTableEntry(r);
            a2 && functionsInTableMap.set(a2, r);
          }
      }, functionsInTableMap, getFunctionAddress = (e) => (functionsInTableMap || (functionsInTableMap = new WeakMap, updateTableMap(0, wasmTable.length)), functionsInTableMap.get(e) || 0), freeTableIndexes = [], getEmptyTableSlot = () => {
        if (freeTableIndexes.length)
          return freeTableIndexes.pop();
        try {
          wasmTable.grow(1);
        } catch (e) {
          throw e instanceof RangeError ? "Unable to grow wasm table. Set ALLOW_TABLE_GROWTH." : e;
        }
        return wasmTable.length - 1;
      }, setWasmTableEntry = (e, t2) => {
        wasmTable.set(e, t2), wasmTableMirror[e] = wasmTable.get(e);
      }, addFunction = (e, t2) => {
        var r = getFunctionAddress(e);
        if (r)
          return r;
        var a2 = getEmptyTableSlot();
        try {
          setWasmTableEntry(a2, e);
        } catch (s4) {
          if (!(s4 instanceof TypeError))
            throw s4;
          var o4 = convertJsFunctionToWasm(e, t2);
          setWasmTableEntry(a2, o4);
        }
        return functionsInTableMap.set(e, a2), a2;
      }, updateGOT = (e, t2) => {
        for (var r in e)
          if (!isInternalSym(r)) {
            var a2 = e[r];
            GOT[r] || (GOT[r] = new WebAssembly.Global({ value: "i32", mutable: true })), (t2 || GOT[r].value == 0) && (typeof a2 == "function" ? GOT[r].value = addFunction(a2) : typeof a2 == "number" ? GOT[r].value = a2 : err(`unhandled export type for '${r}': ${typeof a2}`));
          }
      }, relocateExports = (e, t2, r) => {
        var a2 = {};
        for (var o4 in e) {
          var s4 = e[o4];
          typeof s4 == "object" && (s4 = s4.value), typeof s4 == "number" && (s4 += t2), a2[o4] = s4;
        }
        return updateGOT(a2, r), a2;
      }, isSymbolDefined = (e) => {
        var t2 = wasmImports[e];
        return !(!t2 || t2.stub);
      }, dynCall = (e, t2, r = []) => {
        var a2 = getWasmTableEntry(t2)(...r);
        return a2;
      }, stackSave = () => _emscripten_stack_get_current(), stackRestore = (e) => __emscripten_stack_restore(e), createInvokeFunction = (e) => (t2, ...r) => {
        var a2 = stackSave();
        try {
          return dynCall(e, t2, r);
        } catch (o4) {
          if (stackRestore(a2), o4 !== o4 + 0)
            throw o4;
          if (_setThrew(1, 0), e[0] == "j")
            return 0n;
        }
      }, resolveGlobalSymbol = (e, t2 = false) => {
        var r;
        return isSymbolDefined(e) ? r = wasmImports[e] : e.startsWith("invoke_") && (r = wasmImports[e] = createInvokeFunction(e.split("_")[1])), { sym: r, name: e };
      }, UTF8ToString = (e, t2) => e ? UTF8ArrayToString(HEAPU8, e, t2) : "", loadWebAssemblyModule = (binary, flags, libName, localScope, handle) => {
        var metadata = getDylinkMetadata(binary);
        currentModuleWeakSymbols = metadata.weakImports;
        function loadModule() {
          var firstLoad = !handle || !HEAP8[handle + 8];
          if (firstLoad) {
            var memAlign = Math.pow(2, metadata.memoryAlign), memoryBase = metadata.memorySize ? alignMemory(getMemory(metadata.memorySize + memAlign), memAlign) : 0, tableBase = metadata.tableSize ? wasmTable.length : 0;
            handle && (HEAP8[handle + 8] = 1, HEAPU32[handle + 12 >> 2] = memoryBase, HEAP32[handle + 16 >> 2] = metadata.memorySize, HEAPU32[handle + 20 >> 2] = tableBase, HEAP32[handle + 24 >> 2] = metadata.tableSize);
          } else
            memoryBase = HEAPU32[handle + 12 >> 2], tableBase = HEAPU32[handle + 20 >> 2];
          var tableGrowthNeeded = tableBase + metadata.tableSize - wasmTable.length;
          tableGrowthNeeded > 0 && wasmTable.grow(tableGrowthNeeded);
          var moduleExports;
          function resolveSymbol(e) {
            var t2 = resolveGlobalSymbol(e).sym;
            return !t2 && localScope && (t2 = localScope[e]), t2 || (t2 = moduleExports[e]), t2;
          }
          var proxyHandler = { get(e, t2) {
            switch (t2) {
              case "__memory_base":
                return memoryBase;
              case "__table_base":
                return tableBase;
            }
            if (t2 in wasmImports && !wasmImports[t2].stub)
              return wasmImports[t2];
            if (!(t2 in e)) {
              var r;
              e[t2] = (...a2) => (r || (r = resolveSymbol(t2)), r(...a2));
            }
            return e[t2];
          } }, proxy = new Proxy({}, proxyHandler), info = { "GOT.mem": new Proxy({}, GOTHandler), "GOT.func": new Proxy({}, GOTHandler), env: proxy, wasi_snapshot_preview1: proxy };
          function postInstantiation(module, instance) {
            updateTableMap(tableBase, metadata.tableSize), moduleExports = relocateExports(instance.exports, memoryBase), flags.allowUndefined || reportUndefinedSymbols();
            function addEmAsm(addr, body) {
              for (var args = [], arity = 0;arity < 16 && body.indexOf("$" + arity) != -1; arity++)
                args.push("$" + arity);
              args = args.join(",");
              var func = `(${args}) => { ${body} };`;
              ASM_CONSTS[start] = eval(func);
            }
            if ("__start_em_asm" in moduleExports)
              for (var { __start_em_asm: start, __stop_em_asm: stop } = moduleExports;start < stop; ) {
                var jsString = UTF8ToString(start);
                addEmAsm(start, jsString), start = HEAPU8.indexOf(0, start) + 1;
              }
            function addEmJs(name, cSig, body) {
              var jsArgs = [];
              if (cSig = cSig.slice(1, -1), cSig != "void") {
                cSig = cSig.split(",");
                for (var i in cSig) {
                  var jsArg = cSig[i].split(" ").pop();
                  jsArgs.push(jsArg.replace("*", ""));
                }
              }
              var func = `(${jsArgs}) => ${body};`;
              moduleExports[name] = eval(func);
            }
            for (var name in moduleExports)
              if (name.startsWith("__em_js__")) {
                var start = moduleExports[name], jsString = UTF8ToString(start), parts = jsString.split("<::>");
                addEmJs(name.replace("__em_js__", ""), parts[0], parts[1]), delete moduleExports[name];
              }
            var applyRelocs = moduleExports.__wasm_apply_data_relocs;
            applyRelocs && (runtimeInitialized ? applyRelocs() : __RELOC_FUNCS__.push(applyRelocs));
            var init = moduleExports.__wasm_call_ctors;
            return init && (runtimeInitialized ? init() : __ATINIT__.push(init)), moduleExports;
          }
          if (flags.loadAsync) {
            if (binary instanceof WebAssembly.Module) {
              var instance = new WebAssembly.Instance(binary, info);
              return Promise.resolve(postInstantiation(binary, instance));
            }
            return WebAssembly.instantiate(binary, info).then((e) => postInstantiation(e.module, e.instance));
          }
          var module = binary instanceof WebAssembly.Module ? binary : new WebAssembly.Module(binary), instance = new WebAssembly.Instance(module, info);
          return postInstantiation(module, instance);
        }
        return flags.loadAsync ? metadata.neededDynlibs.reduce((e, t2) => e.then(() => loadDynamicLibrary(t2, flags, localScope)), Promise.resolve()).then(loadModule) : (metadata.neededDynlibs.forEach((e) => loadDynamicLibrary(e, flags, localScope)), loadModule());
      }, mergeLibSymbols = (e, t2) => {
        for (var [r, a2] of Object.entries(e)) {
          let o4 = (n3) => {
            isSymbolDefined(n3) || (wasmImports[n3] = a2);
          };
          o4(r);
          let s4 = "__main_argc_argv";
          r == "main" && o4(s4), r == s4 && o4("main");
        }
      }, asyncLoad = async (e) => {
        var t2 = await readAsync(e);
        return new Uint8Array(t2);
      }, preloadPlugins = Module.preloadPlugins || [], registerWasmPlugin = () => {
        var e = { promiseChainEnd: Promise.resolve(), canHandle: (t2) => !Module.noWasmDecoding && t2.endsWith(".so"), handle: (t2, r, a2, o4) => {
          e.promiseChainEnd = e.promiseChainEnd.then(() => loadWebAssemblyModule(t2, { loadAsync: true, nodelete: true }, r, {})).then((s4) => {
            preloadedWasm[r] = s4, a2(t2);
          }, (s4) => {
            err(`failed to instantiate wasm: ${r}: ${s4}`), o4();
          });
        } };
        preloadPlugins.push(e);
      }, preloadedWasm = {};
      function loadDynamicLibrary(e, t2 = { global: true, nodelete: true }, r, a2) {
        var o4 = LDSO.loadedLibsByName[e];
        if (o4)
          return t2.global ? o4.global || (o4.global = true, mergeLibSymbols(o4.exports, e)) : r && Object.assign(r, o4.exports), t2.nodelete && o4.refcount !== Infinity && (o4.refcount = Infinity), o4.refcount++, a2 && (LDSO.loadedLibsByHandle[a2] = o4), t2.loadAsync ? Promise.resolve(true) : true;
        o4 = newDSO(e, a2, "loading"), o4.refcount = t2.nodelete ? Infinity : 1, o4.global = t2.global;
        function s4() {
          if (a2) {
            var l3 = HEAPU32[a2 + 28 >> 2], p4 = HEAPU32[a2 + 32 >> 2];
            if (l3 && p4) {
              var m4 = HEAP8.slice(l3, l3 + p4);
              return t2.loadAsync ? Promise.resolve(m4) : m4;
            }
          }
          var d2 = locateFile(e);
          if (t2.loadAsync)
            return asyncLoad(d2);
          if (!readBinary)
            throw new Error(`${d2}: file not found, and synchronous loading of external files is not available`);
          return readBinary(d2);
        }
        function n3() {
          var l3 = preloadedWasm[e];
          return l3 ? t2.loadAsync ? Promise.resolve(l3) : l3 : t2.loadAsync ? s4().then((p4) => loadWebAssemblyModule(p4, t2, e, r, a2)) : loadWebAssemblyModule(s4(), t2, e, r, a2);
        }
        function _3(l3) {
          o4.global ? mergeLibSymbols(l3, e) : r && Object.assign(r, l3), o4.exports = l3;
        }
        return t2.loadAsync ? n3().then((l3) => (_3(l3), true)) : (_3(n3()), true);
      }
      var reportUndefinedSymbols = () => {
        for (var [e, t2] of Object.entries(GOT))
          if (t2.value == 0) {
            var r = resolveGlobalSymbol(e, true).sym;
            if (!r && !t2.required)
              continue;
            if (typeof r == "function")
              t2.value = addFunction(r, r.sig);
            else if (typeof r == "number")
              t2.value = r;
            else
              throw new Error(`bad export type for '${e}': ${typeof r}`);
          }
      }, loadDylibs = () => {
        if (!dynamicLibraries.length) {
          reportUndefinedSymbols();
          return;
        }
        addRunDependency("loadDylibs"), dynamicLibraries.reduce((e, t2) => e.then(() => loadDynamicLibrary(t2, { loadAsync: true, global: true, nodelete: true, allowUndefined: true })), Promise.resolve()).then(() => {
          reportUndefinedSymbols(), removeRunDependency("loadDylibs");
        });
      }, noExitRuntime = Module.noExitRuntime || true;
      function setValue(e, t2, r = "i8") {
        switch (r.endsWith("*") && (r = "*"), r) {
          case "i1":
            HEAP8[e] = t2;
            break;
          case "i8":
            HEAP8[e] = t2;
            break;
          case "i16":
            HEAP16[e >> 1] = t2;
            break;
          case "i32":
            HEAP32[e >> 2] = t2;
            break;
          case "i64":
            HEAP64[e >> 3] = BigInt(t2);
            break;
          case "float":
            HEAPF32[e >> 2] = t2;
            break;
          case "double":
            HEAPF64[e >> 3] = t2;
            break;
          case "*":
            HEAPU32[e >> 2] = t2;
            break;
          default:
            abort(`invalid type for setValue: ${r}`);
        }
      }
      var ___assert_fail = (e, t2, r, a2) => abort(`Assertion failed: ${UTF8ToString(e)}, at: ` + [t2 ? UTF8ToString(t2) : "unknown filename", r, a2 ? UTF8ToString(a2) : "unknown function"]);
      ___assert_fail.sig = "vppip";
      var ___call_sighandler = (e, t2) => getWasmTableEntry(e)(t2);
      ___call_sighandler.sig = "vpi";
      var ___memory_base = new WebAssembly.Global({ value: "i32", mutable: false }, 1024);
      Module.___memory_base = ___memory_base;
      var ___stack_pointer = new WebAssembly.Global({ value: "i32", mutable: true }, 2765600);
      Module.___stack_pointer = ___stack_pointer;
      var PATH = { isAbs: (e) => e.charAt(0) === "/", splitPath: (e) => {
        var t2 = /^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/;
        return t2.exec(e).slice(1);
      }, normalizeArray: (e, t2) => {
        for (var r = 0, a2 = e.length - 1;a2 >= 0; a2--) {
          var o4 = e[a2];
          o4 === "." ? e.splice(a2, 1) : o4 === ".." ? (e.splice(a2, 1), r++) : r && (e.splice(a2, 1), r--);
        }
        if (t2)
          for (;r; r--)
            e.unshift("..");
        return e;
      }, normalize: (e) => {
        var t2 = PATH.isAbs(e), r = e.substr(-1) === "/";
        return e = PATH.normalizeArray(e.split("/").filter((a2) => !!a2), !t2).join("/"), !e && !t2 && (e = "."), e && r && (e += "/"), (t2 ? "/" : "") + e;
      }, dirname: (e) => {
        var t2 = PATH.splitPath(e), r = t2[0], a2 = t2[1];
        return !r && !a2 ? "." : (a2 && (a2 = a2.substr(0, a2.length - 1)), r + a2);
      }, basename: (e) => {
        if (e === "/")
          return "/";
        e = PATH.normalize(e), e = e.replace(/\/$/, "");
        var t2 = e.lastIndexOf("/");
        return t2 === -1 ? e : e.substr(t2 + 1);
      }, join: (...e) => PATH.normalize(e.join("/")), join2: (e, t2) => PATH.normalize(e + "/" + t2) }, initRandomFill = () => {
        if (typeof crypto == "object" && typeof crypto.getRandomValues == "function")
          return (a2) => crypto.getRandomValues(a2);
        if (ENVIRONMENT_IS_NODE)
          try {
            var e = require("crypto"), t2 = e.randomFillSync;
            if (t2)
              return (a2) => e.randomFillSync(a2);
            var r = e.randomBytes;
            return (a2) => (a2.set(r(a2.byteLength)), a2);
          } catch {}
        abort("initRandomDevice");
      }, randomFill = (e) => (randomFill = initRandomFill())(e), PATH_FS = { resolve: (...e) => {
        for (var t2 = "", r = false, a2 = e.length - 1;a2 >= -1 && !r; a2--) {
          var o4 = a2 >= 0 ? e[a2] : FS.cwd();
          if (typeof o4 != "string")
            throw new TypeError("Arguments to path.resolve must be strings");
          if (!o4)
            return "";
          t2 = o4 + "/" + t2, r = PATH.isAbs(o4);
        }
        return t2 = PATH.normalizeArray(t2.split("/").filter((s4) => !!s4), !r).join("/"), (r ? "/" : "") + t2 || ".";
      }, relative: (e, t2) => {
        e = PATH_FS.resolve(e).substr(1), t2 = PATH_FS.resolve(t2).substr(1);
        function r(p4) {
          for (var m4 = 0;m4 < p4.length && p4[m4] === ""; m4++)
            ;
          for (var d2 = p4.length - 1;d2 >= 0 && p4[d2] === ""; d2--)
            ;
          return m4 > d2 ? [] : p4.slice(m4, d2 - m4 + 1);
        }
        for (var a2 = r(e.split("/")), o4 = r(t2.split("/")), s4 = Math.min(a2.length, o4.length), n3 = s4, _3 = 0;_3 < s4; _3++)
          if (a2[_3] !== o4[_3]) {
            n3 = _3;
            break;
          }
        for (var l3 = [], _3 = n3;_3 < a2.length; _3++)
          l3.push("..");
        return l3 = l3.concat(o4.slice(n3)), l3.join("/");
      } }, FS_stdin_getChar_buffer = [], lengthBytesUTF8 = (e) => {
        for (var t2 = 0, r = 0;r < e.length; ++r) {
          var a2 = e.charCodeAt(r);
          a2 <= 127 ? t2++ : a2 <= 2047 ? t2 += 2 : a2 >= 55296 && a2 <= 57343 ? (t2 += 4, ++r) : t2 += 3;
        }
        return t2;
      }, stringToUTF8Array = (e, t2, r, a2) => {
        if (!(a2 > 0))
          return 0;
        for (var o4 = r, s4 = r + a2 - 1, n3 = 0;n3 < e.length; ++n3) {
          var _3 = e.charCodeAt(n3);
          if (_3 >= 55296 && _3 <= 57343) {
            var l3 = e.charCodeAt(++n3);
            _3 = 65536 + ((_3 & 1023) << 10) | l3 & 1023;
          }
          if (_3 <= 127) {
            if (r >= s4)
              break;
            t2[r++] = _3;
          } else if (_3 <= 2047) {
            if (r + 1 >= s4)
              break;
            t2[r++] = 192 | _3 >> 6, t2[r++] = 128 | _3 & 63;
          } else if (_3 <= 65535) {
            if (r + 2 >= s4)
              break;
            t2[r++] = 224 | _3 >> 12, t2[r++] = 128 | _3 >> 6 & 63, t2[r++] = 128 | _3 & 63;
          } else {
            if (r + 3 >= s4)
              break;
            t2[r++] = 240 | _3 >> 18, t2[r++] = 128 | _3 >> 12 & 63, t2[r++] = 128 | _3 >> 6 & 63, t2[r++] = 128 | _3 & 63;
          }
        }
        return t2[r] = 0, r - o4;
      };
      function intArrayFromString(e, t2, r) {
        var a2 = r > 0 ? r : lengthBytesUTF8(e) + 1, o4 = new Array(a2), s4 = stringToUTF8Array(e, o4, 0, o4.length);
        return t2 && (o4.length = s4), o4;
      }
      var FS_stdin_getChar = () => {
        if (!FS_stdin_getChar_buffer.length) {
          var e = null;
          if (ENVIRONMENT_IS_NODE) {
            var t2 = 256, r = Buffer.alloc(t2), a2 = 0, o4 = process.stdin.fd;
            try {
              a2 = fs.readSync(o4, r, 0, t2);
            } catch (s4) {
              if (s4.toString().includes("EOF"))
                a2 = 0;
              else
                throw s4;
            }
            a2 > 0 && (e = r.slice(0, a2).toString("utf-8"));
          } else
            typeof window < "u" && typeof window.prompt == "function" && (e = window.prompt("Input: "), e !== null && (e += `
`));
          if (!e)
            return null;
          FS_stdin_getChar_buffer = intArrayFromString(e, true);
        }
        return FS_stdin_getChar_buffer.shift();
      }, TTY = { ttys: [], init() {}, shutdown() {}, register(e, t2) {
        TTY.ttys[e] = { input: [], output: [], ops: t2 }, FS.registerDevice(e, TTY.stream_ops);
      }, stream_ops: { open(e) {
        var t2 = TTY.ttys[e.node.rdev];
        if (!t2)
          throw new FS.ErrnoError(43);
        e.tty = t2, e.seekable = false;
      }, close(e) {
        e.tty.ops.fsync(e.tty);
      }, fsync(e) {
        e.tty.ops.fsync(e.tty);
      }, read(e, t2, r, a2, o4) {
        if (!e.tty || !e.tty.ops.get_char)
          throw new FS.ErrnoError(60);
        for (var s4 = 0, n3 = 0;n3 < a2; n3++) {
          var _3;
          try {
            _3 = e.tty.ops.get_char(e.tty);
          } catch {
            throw new FS.ErrnoError(29);
          }
          if (_3 === undefined && s4 === 0)
            throw new FS.ErrnoError(6);
          if (_3 == null)
            break;
          s4++, t2[r + n3] = _3;
        }
        return s4 && (e.node.atime = Date.now()), s4;
      }, write(e, t2, r, a2, o4) {
        if (!e.tty || !e.tty.ops.put_char)
          throw new FS.ErrnoError(60);
        try {
          for (var s4 = 0;s4 < a2; s4++)
            e.tty.ops.put_char(e.tty, t2[r + s4]);
        } catch {
          throw new FS.ErrnoError(29);
        }
        return a2 && (e.node.mtime = e.node.ctime = Date.now()), s4;
      } }, default_tty_ops: { get_char(e) {
        return FS_stdin_getChar();
      }, put_char(e, t2) {
        t2 === null || t2 === 10 ? (out(UTF8ArrayToString(e.output)), e.output = []) : t2 != 0 && e.output.push(t2);
      }, fsync(e) {
        e.output && e.output.length > 0 && (out(UTF8ArrayToString(e.output)), e.output = []);
      }, ioctl_tcgets(e) {
        return { c_iflag: 25856, c_oflag: 5, c_cflag: 191, c_lflag: 35387, c_cc: [3, 28, 127, 21, 4, 0, 1, 0, 17, 19, 26, 0, 18, 15, 23, 22, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] };
      }, ioctl_tcsets(e, t2, r) {
        return 0;
      }, ioctl_tiocgwinsz(e) {
        return [24, 80];
      } }, default_tty1_ops: { put_char(e, t2) {
        t2 === null || t2 === 10 ? (err(UTF8ArrayToString(e.output)), e.output = []) : t2 != 0 && e.output.push(t2);
      }, fsync(e) {
        e.output && e.output.length > 0 && (err(UTF8ArrayToString(e.output)), e.output = []);
      } } }, zeroMemory = (e, t2) => {
        HEAPU8.fill(0, e, e + t2);
      }, mmapAlloc = (e) => {
        e = alignMemory(e, 65536);
        var t2 = _emscripten_builtin_memalign(65536, e);
        return t2 && zeroMemory(t2, e), t2;
      }, MEMFS = { ops_table: null, mount(e) {
        return MEMFS.createNode(null, "/", 16895, 0);
      }, createNode(e, t2, r, a2) {
        if (FS.isBlkdev(r) || FS.isFIFO(r))
          throw new FS.ErrnoError(63);
        MEMFS.ops_table || (MEMFS.ops_table = { dir: { node: { getattr: MEMFS.node_ops.getattr, setattr: MEMFS.node_ops.setattr, lookup: MEMFS.node_ops.lookup, mknod: MEMFS.node_ops.mknod, rename: MEMFS.node_ops.rename, unlink: MEMFS.node_ops.unlink, rmdir: MEMFS.node_ops.rmdir, readdir: MEMFS.node_ops.readdir, symlink: MEMFS.node_ops.symlink }, stream: { llseek: MEMFS.stream_ops.llseek } }, file: { node: { getattr: MEMFS.node_ops.getattr, setattr: MEMFS.node_ops.setattr }, stream: { llseek: MEMFS.stream_ops.llseek, read: MEMFS.stream_ops.read, write: MEMFS.stream_ops.write, allocate: MEMFS.stream_ops.allocate, mmap: MEMFS.stream_ops.mmap, msync: MEMFS.stream_ops.msync } }, link: { node: { getattr: MEMFS.node_ops.getattr, setattr: MEMFS.node_ops.setattr, readlink: MEMFS.node_ops.readlink }, stream: {} }, chrdev: { node: { getattr: MEMFS.node_ops.getattr, setattr: MEMFS.node_ops.setattr }, stream: FS.chrdev_stream_ops } });
        var o4 = FS.createNode(e, t2, r, a2);
        return FS.isDir(o4.mode) ? (o4.node_ops = MEMFS.ops_table.dir.node, o4.stream_ops = MEMFS.ops_table.dir.stream, o4.contents = {}) : FS.isFile(o4.mode) ? (o4.node_ops = MEMFS.ops_table.file.node, o4.stream_ops = MEMFS.ops_table.file.stream, o4.usedBytes = 0, o4.contents = null) : FS.isLink(o4.mode) ? (o4.node_ops = MEMFS.ops_table.link.node, o4.stream_ops = MEMFS.ops_table.link.stream) : FS.isChrdev(o4.mode) && (o4.node_ops = MEMFS.ops_table.chrdev.node, o4.stream_ops = MEMFS.ops_table.chrdev.stream), o4.atime = o4.mtime = o4.ctime = Date.now(), e && (e.contents[t2] = o4, e.atime = e.mtime = e.ctime = o4.atime), o4;
      }, getFileDataAsTypedArray(e) {
        return e.contents ? e.contents.subarray ? e.contents.subarray(0, e.usedBytes) : new Uint8Array(e.contents) : new Uint8Array(0);
      }, expandFileStorage(e, t2) {
        var r = e.contents ? e.contents.length : 0;
        if (!(r >= t2)) {
          var a2 = 1048576;
          t2 = Math.max(t2, r * (r < a2 ? 2 : 1.125) >>> 0), r != 0 && (t2 = Math.max(t2, 256));
          var o4 = e.contents;
          e.contents = new Uint8Array(t2), e.usedBytes > 0 && e.contents.set(o4.subarray(0, e.usedBytes), 0);
        }
      }, resizeFileStorage(e, t2) {
        if (e.usedBytes != t2)
          if (t2 == 0)
            e.contents = null, e.usedBytes = 0;
          else {
            var r = e.contents;
            e.contents = new Uint8Array(t2), r && e.contents.set(r.subarray(0, Math.min(t2, e.usedBytes))), e.usedBytes = t2;
          }
      }, node_ops: { getattr(e) {
        var t2 = {};
        return t2.dev = FS.isChrdev(e.mode) ? e.id : 1, t2.ino = e.id, t2.mode = e.mode, t2.nlink = 1, t2.uid = 0, t2.gid = 0, t2.rdev = e.rdev, FS.isDir(e.mode) ? t2.size = 4096 : FS.isFile(e.mode) ? t2.size = e.usedBytes : FS.isLink(e.mode) ? t2.size = e.link.length : t2.size = 0, t2.atime = new Date(e.atime), t2.mtime = new Date(e.mtime), t2.ctime = new Date(e.ctime), t2.blksize = 4096, t2.blocks = Math.ceil(t2.size / t2.blksize), t2;
      }, setattr(e, t2) {
        for (let r of ["mode", "atime", "mtime", "ctime"])
          t2[r] && (e[r] = t2[r]);
        t2.size !== undefined && MEMFS.resizeFileStorage(e, t2.size);
      }, lookup(e, t2) {
        throw MEMFS.doesNotExistError;
      }, mknod(e, t2, r, a2) {
        return MEMFS.createNode(e, t2, r, a2);
      }, rename(e, t2, r) {
        var a2;
        try {
          a2 = FS.lookupNode(t2, r);
        } catch {}
        if (a2) {
          if (FS.isDir(e.mode))
            for (var o4 in a2.contents)
              throw new FS.ErrnoError(55);
          FS.hashRemoveNode(a2);
        }
        delete e.parent.contents[e.name], t2.contents[r] = e, e.name = r, t2.ctime = t2.mtime = e.parent.ctime = e.parent.mtime = Date.now();
      }, unlink(e, t2) {
        delete e.contents[t2], e.ctime = e.mtime = Date.now();
      }, rmdir(e, t2) {
        var r = FS.lookupNode(e, t2);
        for (var a2 in r.contents)
          throw new FS.ErrnoError(55);
        delete e.contents[t2], e.ctime = e.mtime = Date.now();
      }, readdir(e) {
        return [".", "..", ...Object.keys(e.contents)];
      }, symlink(e, t2, r) {
        var a2 = MEMFS.createNode(e, t2, 41471, 0);
        return a2.link = r, a2;
      }, readlink(e) {
        if (!FS.isLink(e.mode))
          throw new FS.ErrnoError(28);
        return e.link;
      } }, stream_ops: { read(e, t2, r, a2, o4) {
        var s4 = e.node.contents;
        if (o4 >= e.node.usedBytes)
          return 0;
        var n3 = Math.min(e.node.usedBytes - o4, a2);
        if (n3 > 8 && s4.subarray)
          t2.set(s4.subarray(o4, o4 + n3), r);
        else
          for (var _3 = 0;_3 < n3; _3++)
            t2[r + _3] = s4[o4 + _3];
        return n3;
      }, write(e, t2, r, a2, o4, s4) {
        if (t2.buffer === HEAP8.buffer && (s4 = false), !a2)
          return 0;
        var n3 = e.node;
        if (n3.mtime = n3.ctime = Date.now(), t2.subarray && (!n3.contents || n3.contents.subarray)) {
          if (s4)
            return n3.contents = t2.subarray(r, r + a2), n3.usedBytes = a2, a2;
          if (n3.usedBytes === 0 && o4 === 0)
            return n3.contents = t2.slice(r, r + a2), n3.usedBytes = a2, a2;
          if (o4 + a2 <= n3.usedBytes)
            return n3.contents.set(t2.subarray(r, r + a2), o4), a2;
        }
        if (MEMFS.expandFileStorage(n3, o4 + a2), n3.contents.subarray && t2.subarray)
          n3.contents.set(t2.subarray(r, r + a2), o4);
        else
          for (var _3 = 0;_3 < a2; _3++)
            n3.contents[o4 + _3] = t2[r + _3];
        return n3.usedBytes = Math.max(n3.usedBytes, o4 + a2), a2;
      }, llseek(e, t2, r) {
        var a2 = t2;
        if (r === 1 ? a2 += e.position : r === 2 && FS.isFile(e.node.mode) && (a2 += e.node.usedBytes), a2 < 0)
          throw new FS.ErrnoError(28);
        return a2;
      }, allocate(e, t2, r) {
        MEMFS.expandFileStorage(e.node, t2 + r), e.node.usedBytes = Math.max(e.node.usedBytes, t2 + r);
      }, mmap(e, t2, r, a2, o4) {
        if (!FS.isFile(e.node.mode))
          throw new FS.ErrnoError(43);
        var s4, n3, _3 = e.node.contents;
        if (!(o4 & 2) && _3 && _3.buffer === HEAP8.buffer)
          n3 = false, s4 = _3.byteOffset;
        else {
          if (n3 = true, s4 = mmapAlloc(t2), !s4)
            throw new FS.ErrnoError(48);
          _3 && ((r > 0 || r + t2 < _3.length) && (_3.subarray ? _3 = _3.subarray(r, r + t2) : _3 = Array.prototype.slice.call(_3, r, r + t2)), HEAP8.set(_3, s4));
        }
        return { ptr: s4, allocated: n3 };
      }, msync(e, t2, r, a2, o4) {
        return MEMFS.stream_ops.write(e, t2, 0, a2, r, false), 0;
      } } }, FS_createDataFile = (e, t2, r, a2, o4, s4) => {
        FS.createDataFile(e, t2, r, a2, o4, s4);
      }, FS_handledByPreloadPlugin = (e, t2, r, a2) => {
        typeof Browser < "u" && Browser.init();
        var o4 = false;
        return preloadPlugins.forEach((s4) => {
          o4 || s4.canHandle(t2) && (s4.handle(e, t2, r, a2), o4 = true);
        }), o4;
      }, FS_createPreloadedFile = (e, t2, r, a2, o4, s4, n3, _3, l3, p4) => {
        var m4 = t2 ? PATH_FS.resolve(PATH.join2(e, t2)) : e, d2 = `cp ${m4}`;
        function g5(u2) {
          function f3(c2) {
            p4?.(), _3 || FS_createDataFile(e, t2, c2, a2, o4, l3), s4?.(), removeRunDependency(d2);
          }
          FS_handledByPreloadPlugin(u2, m4, f3, () => {
            n3?.(), removeRunDependency(d2);
          }) || f3(u2);
        }
        addRunDependency(d2), typeof r == "string" ? asyncLoad(r).then(g5, n3) : g5(r);
      }, FS_modeStringToFlags = (e) => {
        var t2 = { r: 0, "r+": 2, w: 577, "w+": 578, a: 1089, "a+": 1090 }, r = t2[e];
        if (typeof r > "u")
          throw new Error(`Unknown file open mode: ${e}`);
        return r;
      }, FS_getMode = (e, t2) => {
        var r = 0;
        return e && (r |= 365), t2 && (r |= 146), r;
      }, IDBFS = { dbs: {}, indexedDB: () => {
        if (typeof indexedDB < "u")
          return indexedDB;
        var e = null;
        return typeof window == "object" && (e = window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB), e;
      }, DB_VERSION: 21, DB_STORE_NAME: "FILE_DATA", queuePersist: (e) => {
        function t2() {
          e.idbPersistState === "again" ? r() : e.idbPersistState = 0;
        }
        function r() {
          e.idbPersistState = "idb", IDBFS.syncfs(e, false, t2);
        }
        e.idbPersistState ? e.idbPersistState === "idb" && (e.idbPersistState = "again") : e.idbPersistState = setTimeout(r, 0);
      }, mount: (e) => {
        var t2 = MEMFS.mount(e);
        if (e?.opts?.autoPersist) {
          t2.idbPersistState = 0;
          var r = t2.node_ops;
          t2.node_ops = Object.assign({}, t2.node_ops), t2.node_ops.mknod = (a2, o4, s4, n3) => {
            var _3 = r.mknod(a2, o4, s4, n3);
            return _3.node_ops = t2.node_ops, _3.idbfs_mount = t2.mount, _3.memfs_stream_ops = _3.stream_ops, _3.stream_ops = Object.assign({}, _3.stream_ops), _3.stream_ops.write = (l3, p4, m4, d2, g5, u2) => (l3.node.isModified = true, _3.memfs_stream_ops.write(l3, p4, m4, d2, g5, u2)), _3.stream_ops.close = (l3) => {
              var p4 = l3.node;
              if (p4.isModified && (IDBFS.queuePersist(p4.idbfs_mount), p4.isModified = false), p4.memfs_stream_ops.close)
                return p4.memfs_stream_ops.close(l3);
            }, _3;
          }, t2.node_ops.mkdir = (...a2) => (IDBFS.queuePersist(t2.mount), r.mkdir(...a2)), t2.node_ops.rmdir = (...a2) => (IDBFS.queuePersist(t2.mount), r.rmdir(...a2)), t2.node_ops.symlink = (...a2) => (IDBFS.queuePersist(t2.mount), r.symlink(...a2)), t2.node_ops.unlink = (...a2) => (IDBFS.queuePersist(t2.mount), r.unlink(...a2)), t2.node_ops.rename = (...a2) => (IDBFS.queuePersist(t2.mount), r.rename(...a2));
        }
        return t2;
      }, syncfs: (e, t2, r) => {
        IDBFS.getLocalSet(e, (a2, o4) => {
          if (a2)
            return r(a2);
          IDBFS.getRemoteSet(e, (s4, n3) => {
            if (s4)
              return r(s4);
            var _3 = t2 ? n3 : o4, l3 = t2 ? o4 : n3;
            IDBFS.reconcile(_3, l3, r);
          });
        });
      }, quit: () => {
        Object.values(IDBFS.dbs).forEach((e) => e.close()), IDBFS.dbs = {};
      }, getDB: (e, t2) => {
        var r = IDBFS.dbs[e];
        if (r)
          return t2(null, r);
        var a2;
        try {
          a2 = IDBFS.indexedDB().open(e, IDBFS.DB_VERSION);
        } catch (o4) {
          return t2(o4);
        }
        if (!a2)
          return t2("Unable to connect to IndexedDB");
        a2.onupgradeneeded = (o4) => {
          var s4 = o4.target.result, n3 = o4.target.transaction, _3;
          s4.objectStoreNames.contains(IDBFS.DB_STORE_NAME) ? _3 = n3.objectStore(IDBFS.DB_STORE_NAME) : _3 = s4.createObjectStore(IDBFS.DB_STORE_NAME), _3.indexNames.contains("timestamp") || _3.createIndex("timestamp", "timestamp", { unique: false });
        }, a2.onsuccess = () => {
          r = a2.result, IDBFS.dbs[e] = r, t2(null, r);
        }, a2.onerror = (o4) => {
          t2(o4.target.error), o4.preventDefault();
        };
      }, getLocalSet: (e, t2) => {
        var r = {};
        function a2(l3) {
          return l3 !== "." && l3 !== "..";
        }
        function o4(l3) {
          return (p4) => PATH.join2(l3, p4);
        }
        for (var s4 = FS.readdir(e.mountpoint).filter(a2).map(o4(e.mountpoint));s4.length; ) {
          var n3 = s4.pop(), _3;
          try {
            _3 = FS.stat(n3);
          } catch (l3) {
            return t2(l3);
          }
          FS.isDir(_3.mode) && s4.push(...FS.readdir(n3).filter(a2).map(o4(n3))), r[n3] = { timestamp: _3.mtime };
        }
        return t2(null, { type: "local", entries: r });
      }, getRemoteSet: (e, t2) => {
        var r = {};
        IDBFS.getDB(e.mountpoint, (a2, o4) => {
          if (a2)
            return t2(a2);
          try {
            var s4 = o4.transaction([IDBFS.DB_STORE_NAME], "readonly");
            s4.onerror = (l3) => {
              t2(l3.target.error), l3.preventDefault();
            };
            var n3 = s4.objectStore(IDBFS.DB_STORE_NAME), _3 = n3.index("timestamp");
            _3.openKeyCursor().onsuccess = (l3) => {
              var p4 = l3.target.result;
              if (!p4)
                return t2(null, { type: "remote", db: o4, entries: r });
              r[p4.primaryKey] = { timestamp: p4.key }, p4.continue();
            };
          } catch (l3) {
            return t2(l3);
          }
        });
      }, loadLocalEntry: (e, t2) => {
        var r, a2;
        try {
          var o4 = FS.lookupPath(e);
          a2 = o4.node, r = FS.stat(e);
        } catch (s4) {
          return t2(s4);
        }
        return FS.isDir(r.mode) ? t2(null, { timestamp: r.mtime, mode: r.mode }) : FS.isFile(r.mode) ? (a2.contents = MEMFS.getFileDataAsTypedArray(a2), t2(null, { timestamp: r.mtime, mode: r.mode, contents: a2.contents })) : t2(new Error("node type not supported"));
      }, storeLocalEntry: (e, t2, r) => {
        try {
          if (FS.isDir(t2.mode))
            FS.mkdirTree(e, t2.mode);
          else if (FS.isFile(t2.mode))
            FS.writeFile(e, t2.contents, { canOwn: true });
          else
            return r(new Error("node type not supported"));
          FS.chmod(e, t2.mode), FS.utime(e, t2.timestamp, t2.timestamp);
        } catch (a2) {
          return r(a2);
        }
        r(null);
      }, removeLocalEntry: (e, t2) => {
        try {
          var r = FS.stat(e);
          FS.isDir(r.mode) ? FS.rmdir(e) : FS.isFile(r.mode) && FS.unlink(e);
        } catch (a2) {
          return t2(a2);
        }
        t2(null);
      }, loadRemoteEntry: (e, t2, r) => {
        var a2 = e.get(t2);
        a2.onsuccess = (o4) => r(null, o4.target.result), a2.onerror = (o4) => {
          r(o4.target.error), o4.preventDefault();
        };
      }, storeRemoteEntry: (e, t2, r, a2) => {
        try {
          var o4 = e.put(r, t2);
        } catch (s4) {
          a2(s4);
          return;
        }
        o4.onsuccess = (s4) => a2(), o4.onerror = (s4) => {
          a2(s4.target.error), s4.preventDefault();
        };
      }, removeRemoteEntry: (e, t2, r) => {
        var a2 = e.delete(t2);
        a2.onsuccess = (o4) => r(), a2.onerror = (o4) => {
          r(o4.target.error), o4.preventDefault();
        };
      }, reconcile: (e, t2, r) => {
        var a2 = 0, o4 = [];
        Object.keys(e.entries).forEach((d2) => {
          var g5 = e.entries[d2], u2 = t2.entries[d2];
          (!u2 || g5.timestamp.getTime() != u2.timestamp.getTime()) && (o4.push(d2), a2++);
        });
        var s4 = [];
        if (Object.keys(t2.entries).forEach((d2) => {
          e.entries[d2] || (s4.push(d2), a2++);
        }), !a2)
          return r(null);
        var n3 = false, _3 = e.type === "remote" ? e.db : t2.db, l3 = _3.transaction([IDBFS.DB_STORE_NAME], "readwrite"), p4 = l3.objectStore(IDBFS.DB_STORE_NAME);
        function m4(d2) {
          if (d2 && !n3)
            return n3 = true, r(d2);
        }
        l3.onerror = l3.onabort = (d2) => {
          m4(d2.target.error), d2.preventDefault();
        }, l3.oncomplete = (d2) => {
          n3 || r(null);
        }, o4.sort().forEach((d2) => {
          t2.type === "local" ? IDBFS.loadRemoteEntry(p4, d2, (g5, u2) => {
            if (g5)
              return m4(g5);
            IDBFS.storeLocalEntry(d2, u2, m4);
          }) : IDBFS.loadLocalEntry(d2, (g5, u2) => {
            if (g5)
              return m4(g5);
            IDBFS.storeRemoteEntry(p4, d2, u2, m4);
          });
        }), s4.sort().reverse().forEach((d2) => {
          t2.type === "local" ? IDBFS.removeLocalEntry(d2, m4) : IDBFS.removeRemoteEntry(p4, d2, m4);
        });
      } }, ERRNO_CODES = { EPERM: 63, ENOENT: 44, ESRCH: 71, EINTR: 27, EIO: 29, ENXIO: 60, E2BIG: 1, ENOEXEC: 45, EBADF: 8, ECHILD: 12, EAGAIN: 6, EWOULDBLOCK: 6, ENOMEM: 48, EACCES: 2, EFAULT: 21, ENOTBLK: 105, EBUSY: 10, EEXIST: 20, EXDEV: 75, ENODEV: 43, ENOTDIR: 54, EISDIR: 31, EINVAL: 28, ENFILE: 41, EMFILE: 33, ENOTTY: 59, ETXTBSY: 74, EFBIG: 22, ENOSPC: 51, ESPIPE: 70, EROFS: 69, EMLINK: 34, EPIPE: 64, EDOM: 18, ERANGE: 68, ENOMSG: 49, EIDRM: 24, ECHRNG: 106, EL2NSYNC: 156, EL3HLT: 107, EL3RST: 108, ELNRNG: 109, EUNATCH: 110, ENOCSI: 111, EL2HLT: 112, EDEADLK: 16, ENOLCK: 46, EBADE: 113, EBADR: 114, EXFULL: 115, ENOANO: 104, EBADRQC: 103, EBADSLT: 102, EDEADLOCK: 16, EBFONT: 101, ENOSTR: 100, ENODATA: 116, ETIME: 117, ENOSR: 118, ENONET: 119, ENOPKG: 120, EREMOTE: 121, ENOLINK: 47, EADV: 122, ESRMNT: 123, ECOMM: 124, EPROTO: 65, EMULTIHOP: 36, EDOTDOT: 125, EBADMSG: 9, ENOTUNIQ: 126, EBADFD: 127, EREMCHG: 128, ELIBACC: 129, ELIBBAD: 130, ELIBSCN: 131, ELIBMAX: 132, ELIBEXEC: 133, ENOSYS: 52, ENOTEMPTY: 55, ENAMETOOLONG: 37, ELOOP: 32, EOPNOTSUPP: 138, EPFNOSUPPORT: 139, ECONNRESET: 15, ENOBUFS: 42, EAFNOSUPPORT: 5, EPROTOTYPE: 67, ENOTSOCK: 57, ENOPROTOOPT: 50, ESHUTDOWN: 140, ECONNREFUSED: 14, EADDRINUSE: 3, ECONNABORTED: 13, ENETUNREACH: 40, ENETDOWN: 38, ETIMEDOUT: 73, EHOSTDOWN: 142, EHOSTUNREACH: 23, EINPROGRESS: 26, EALREADY: 7, EDESTADDRREQ: 17, EMSGSIZE: 35, EPROTONOSUPPORT: 66, ESOCKTNOSUPPORT: 137, EADDRNOTAVAIL: 4, ENETRESET: 39, EISCONN: 30, ENOTCONN: 53, ETOOMANYREFS: 141, EUSERS: 136, EDQUOT: 19, ESTALE: 72, ENOTSUP: 138, ENOMEDIUM: 148, EILSEQ: 25, EOVERFLOW: 61, ECANCELED: 11, ENOTRECOVERABLE: 56, EOWNERDEAD: 62, ESTRPIPE: 135 }, NODEFS = { isWindows: false, staticInit() {
        NODEFS.isWindows = !!process.platform.match(/^win/);
        var e = process.binding("constants");
        e.fs && (e = e.fs), NODEFS.flagsForNodeMap = { 1024: e.O_APPEND, 64: e.O_CREAT, 128: e.O_EXCL, 256: e.O_NOCTTY, 0: e.O_RDONLY, 2: e.O_RDWR, 4096: e.O_SYNC, 512: e.O_TRUNC, 1: e.O_WRONLY, 131072: e.O_NOFOLLOW };
      }, convertNodeCode(e) {
        var t2 = e.code;
        return ERRNO_CODES[t2];
      }, tryFSOperation(e) {
        try {
          return e();
        } catch (t2) {
          throw t2.code ? t2.code === "UNKNOWN" ? new FS.ErrnoError(28) : new FS.ErrnoError(NODEFS.convertNodeCode(t2)) : t2;
        }
      }, mount(e) {
        return NODEFS.createNode(null, "/", NODEFS.getMode(e.opts.root), 0);
      }, createNode(e, t2, r, a2) {
        if (!FS.isDir(r) && !FS.isFile(r) && !FS.isLink(r))
          throw new FS.ErrnoError(28);
        var o4 = FS.createNode(e, t2, r);
        return o4.node_ops = NODEFS.node_ops, o4.stream_ops = NODEFS.stream_ops, o4;
      }, getMode(e) {
        return NODEFS.tryFSOperation(() => {
          var t2 = fs.lstatSync(e).mode;
          return NODEFS.isWindows && (t2 |= (t2 & 292) >> 2), t2;
        });
      }, realPath(e) {
        for (var t2 = [];e.parent !== e; )
          t2.push(e.name), e = e.parent;
        return t2.push(e.mount.opts.root), t2.reverse(), PATH.join(...t2);
      }, flagsForNode(e) {
        e &= -2097153, e &= -2049, e &= -32769, e &= -524289, e &= -65537;
        var t2 = 0;
        for (var r in NODEFS.flagsForNodeMap)
          e & r && (t2 |= NODEFS.flagsForNodeMap[r], e ^= r);
        if (e)
          throw new FS.ErrnoError(28);
        return t2;
      }, node_ops: { getattr(e) {
        var t2 = NODEFS.realPath(e), r;
        return NODEFS.tryFSOperation(() => r = fs.lstatSync(t2)), NODEFS.isWindows && (r.blksize || (r.blksize = 4096), r.blocks || (r.blocks = (r.size + r.blksize - 1) / r.blksize | 0), r.mode |= (r.mode & 292) >> 2), { dev: r.dev, ino: r.ino, mode: r.mode, nlink: r.nlink, uid: r.uid, gid: r.gid, rdev: r.rdev, size: r.size, atime: r.atime, mtime: r.mtime, ctime: r.ctime, blksize: r.blksize, blocks: r.blocks };
      }, setattr(e, t2) {
        var r = NODEFS.realPath(e);
        NODEFS.tryFSOperation(() => {
          if (t2.mode !== undefined) {
            var a2 = t2.mode;
            NODEFS.isWindows && (a2 &= 384), fs.chmodSync(r, a2), e.mode = t2.mode;
          }
          if (t2.atime || t2.mtime) {
            var o4 = t2.atime && new Date(t2.atime), s4 = t2.mtime && new Date(t2.mtime);
            fs.utimesSync(r, o4, s4);
          }
          t2.size !== undefined && fs.truncateSync(r, t2.size);
        });
      }, lookup(e, t2) {
        var r = PATH.join2(NODEFS.realPath(e), t2), a2 = NODEFS.getMode(r);
        return NODEFS.createNode(e, t2, a2);
      }, mknod(e, t2, r, a2) {
        var o4 = NODEFS.createNode(e, t2, r, a2), s4 = NODEFS.realPath(o4);
        return NODEFS.tryFSOperation(() => {
          FS.isDir(o4.mode) ? fs.mkdirSync(s4, o4.mode) : fs.writeFileSync(s4, "", { mode: o4.mode });
        }), o4;
      }, rename(e, t2, r) {
        var a2 = NODEFS.realPath(e), o4 = PATH.join2(NODEFS.realPath(t2), r);
        try {
          FS.unlink(o4);
        } catch {}
        NODEFS.tryFSOperation(() => fs.renameSync(a2, o4)), e.name = r;
      }, unlink(e, t2) {
        var r = PATH.join2(NODEFS.realPath(e), t2);
        NODEFS.tryFSOperation(() => fs.unlinkSync(r));
      }, rmdir(e, t2) {
        var r = PATH.join2(NODEFS.realPath(e), t2);
        NODEFS.tryFSOperation(() => fs.rmdirSync(r));
      }, readdir(e) {
        var t2 = NODEFS.realPath(e);
        return NODEFS.tryFSOperation(() => fs.readdirSync(t2));
      }, symlink(e, t2, r) {
        var a2 = PATH.join2(NODEFS.realPath(e), t2);
        NODEFS.tryFSOperation(() => fs.symlinkSync(r, a2));
      }, readlink(e) {
        var t2 = NODEFS.realPath(e);
        return NODEFS.tryFSOperation(() => fs.readlinkSync(t2));
      }, statfs(e) {
        var t2 = NODEFS.tryFSOperation(() => fs.statfsSync(e));
        return t2.frsize = t2.bsize, t2;
      } }, stream_ops: { open(e) {
        var t2 = NODEFS.realPath(e.node);
        NODEFS.tryFSOperation(() => {
          FS.isFile(e.node.mode) && (e.shared.refcount = 1, e.nfd = fs.openSync(t2, NODEFS.flagsForNode(e.flags)));
        });
      }, close(e) {
        NODEFS.tryFSOperation(() => {
          FS.isFile(e.node.mode) && e.nfd && --e.shared.refcount === 0 && fs.closeSync(e.nfd);
        });
      }, dup(e) {
        e.shared.refcount++;
      }, read(e, t2, r, a2, o4) {
        return a2 === 0 ? 0 : NODEFS.tryFSOperation(() => fs.readSync(e.nfd, new Int8Array(t2.buffer, r, a2), 0, a2, o4));
      }, write(e, t2, r, a2, o4) {
        return NODEFS.tryFSOperation(() => fs.writeSync(e.nfd, new Int8Array(t2.buffer, r, a2), 0, a2, o4));
      }, llseek(e, t2, r) {
        var a2 = t2;
        if (r === 1 ? a2 += e.position : r === 2 && FS.isFile(e.node.mode) && NODEFS.tryFSOperation(() => {
          var o4 = fs.fstatSync(e.nfd);
          a2 += o4.size;
        }), a2 < 0)
          throw new FS.ErrnoError(28);
        return a2;
      }, mmap(e, t2, r, a2, o4) {
        if (!FS.isFile(e.node.mode))
          throw new FS.ErrnoError(43);
        var s4 = mmapAlloc(t2);
        return NODEFS.stream_ops.read(e, HEAP8, s4, t2, r), { ptr: s4, allocated: true };
      }, msync(e, t2, r, a2, o4) {
        return NODEFS.stream_ops.write(e, t2, 0, a2, r, false), 0;
      } } }, FS = { root: null, mounts: [], devices: {}, streams: [], nextInode: 1, nameTable: null, currentPath: "/", initialized: false, ignorePermissions: true, ErrnoError: class {
        constructor(e) {
          P(this, "name", "ErrnoError");
          this.errno = e;
        }
      }, filesystems: null, syncFSRequests: 0, readFiles: {}, FSStream: class {
        constructor() {
          P(this, "shared", {});
        }
        get object() {
          return this.node;
        }
        set object(e) {
          this.node = e;
        }
        get isRead() {
          return (this.flags & 2097155) !== 1;
        }
        get isWrite() {
          return (this.flags & 2097155) !== 0;
        }
        get isAppend() {
          return this.flags & 1024;
        }
        get flags() {
          return this.shared.flags;
        }
        set flags(e) {
          this.shared.flags = e;
        }
        get position() {
          return this.shared.position;
        }
        set position(e) {
          this.shared.position = e;
        }
      }, FSNode: class {
        constructor(e, t2, r, a2) {
          P(this, "node_ops", {});
          P(this, "stream_ops", {});
          P(this, "readMode", 365);
          P(this, "writeMode", 146);
          P(this, "mounted", null);
          e || (e = this), this.parent = e, this.mount = e.mount, this.id = FS.nextInode++, this.name = t2, this.mode = r, this.rdev = a2, this.atime = this.mtime = this.ctime = Date.now();
        }
        get read() {
          return (this.mode & this.readMode) === this.readMode;
        }
        set read(e) {
          e ? this.mode |= this.readMode : this.mode &= ~this.readMode;
        }
        get write() {
          return (this.mode & this.writeMode) === this.writeMode;
        }
        set write(e) {
          e ? this.mode |= this.writeMode : this.mode &= ~this.writeMode;
        }
        get isFolder() {
          return FS.isDir(this.mode);
        }
        get isDevice() {
          return FS.isChrdev(this.mode);
        }
      }, lookupPath(e, t2 = {}) {
        if (!e)
          return { path: "", node: null };
        t2.follow_mount ?? (t2.follow_mount = true), PATH.isAbs(e) || (e = FS.cwd() + "/" + e);
        e:
          for (var r = 0;r < 40; r++) {
            for (var a2 = e.split("/").filter((p4) => !!p4 && p4 !== "."), o4 = FS.root, s4 = "/", n3 = 0;n3 < a2.length; n3++) {
              var _3 = n3 === a2.length - 1;
              if (_3 && t2.parent)
                break;
              if (a2[n3] === "..") {
                s4 = PATH.dirname(s4), o4 = o4.parent;
                continue;
              }
              s4 = PATH.join2(s4, a2[n3]);
              try {
                o4 = FS.lookupNode(o4, a2[n3]);
              } catch (p4) {
                if (p4?.errno === 44 && _3 && t2.noent_okay)
                  return { path: s4 };
                throw p4;
              }
              if (FS.isMountpoint(o4) && (!_3 || t2.follow_mount) && (o4 = o4.mounted.root), FS.isLink(o4.mode) && (!_3 || t2.follow)) {
                if (!o4.node_ops.readlink)
                  throw new FS.ErrnoError(52);
                var l3 = o4.node_ops.readlink(o4);
                PATH.isAbs(l3) || (l3 = PATH.dirname(s4) + "/" + l3), e = l3 + "/" + a2.slice(n3 + 1).join("/");
                continue e;
              }
            }
            return { path: s4, node: o4 };
          }
        throw new FS.ErrnoError(32);
      }, getPath(e) {
        for (var t2;; ) {
          if (FS.isRoot(e)) {
            var r = e.mount.mountpoint;
            return t2 ? r[r.length - 1] !== "/" ? `${r}/${t2}` : r + t2 : r;
          }
          t2 = t2 ? `${e.name}/${t2}` : e.name, e = e.parent;
        }
      }, hashName(e, t2) {
        for (var r = 0, a2 = 0;a2 < t2.length; a2++)
          r = (r << 5) - r + t2.charCodeAt(a2) | 0;
        return (e + r >>> 0) % FS.nameTable.length;
      }, hashAddNode(e) {
        var t2 = FS.hashName(e.parent.id, e.name);
        e.name_next = FS.nameTable[t2], FS.nameTable[t2] = e;
      }, hashRemoveNode(e) {
        var t2 = FS.hashName(e.parent.id, e.name);
        if (FS.nameTable[t2] === e)
          FS.nameTable[t2] = e.name_next;
        else
          for (var r = FS.nameTable[t2];r; ) {
            if (r.name_next === e) {
              r.name_next = e.name_next;
              break;
            }
            r = r.name_next;
          }
      }, lookupNode(e, t2) {
        var r = FS.mayLookup(e);
        if (r)
          throw new FS.ErrnoError(r);
        for (var a2 = FS.hashName(e.id, t2), o4 = FS.nameTable[a2];o4; o4 = o4.name_next) {
          var s4 = o4.name;
          if (o4.parent.id === e.id && s4 === t2)
            return o4;
        }
        return FS.lookup(e, t2);
      }, createNode(e, t2, r, a2) {
        var o4 = new FS.FSNode(e, t2, r, a2);
        return FS.hashAddNode(o4), o4;
      }, destroyNode(e) {
        FS.hashRemoveNode(e);
      }, isRoot(e) {
        return e === e.parent;
      }, isMountpoint(e) {
        return !!e.mounted;
      }, isFile(e) {
        return (e & 61440) === 32768;
      }, isDir(e) {
        return (e & 61440) === 16384;
      }, isLink(e) {
        return (e & 61440) === 40960;
      }, isChrdev(e) {
        return (e & 61440) === 8192;
      }, isBlkdev(e) {
        return (e & 61440) === 24576;
      }, isFIFO(e) {
        return (e & 61440) === 4096;
      }, isSocket(e) {
        return (e & 49152) === 49152;
      }, flagsToPermissionString(e) {
        var t2 = ["r", "w", "rw"][e & 3];
        return e & 512 && (t2 += "w"), t2;
      }, nodePermissions(e, t2) {
        return FS.ignorePermissions ? 0 : t2.includes("r") && !(e.mode & 292) || t2.includes("w") && !(e.mode & 146) || t2.includes("x") && !(e.mode & 73) ? 2 : 0;
      }, mayLookup(e) {
        if (!FS.isDir(e.mode))
          return 54;
        var t2 = FS.nodePermissions(e, "x");
        return t2 || (e.node_ops.lookup ? 0 : 2);
      }, mayCreate(e, t2) {
        if (!FS.isDir(e.mode))
          return 54;
        try {
          var r = FS.lookupNode(e, t2);
          return 20;
        } catch {}
        return FS.nodePermissions(e, "wx");
      }, mayDelete(e, t2, r) {
        var a2;
        try {
          a2 = FS.lookupNode(e, t2);
        } catch (s4) {
          return s4.errno;
        }
        var o4 = FS.nodePermissions(e, "wx");
        if (o4)
          return o4;
        if (r) {
          if (!FS.isDir(a2.mode))
            return 54;
          if (FS.isRoot(a2) || FS.getPath(a2) === FS.cwd())
            return 10;
        } else if (FS.isDir(a2.mode))
          return 31;
        return 0;
      }, mayOpen(e, t2) {
        return e ? FS.isLink(e.mode) ? 32 : FS.isDir(e.mode) && (FS.flagsToPermissionString(t2) !== "r" || t2 & 512) ? 31 : FS.nodePermissions(e, FS.flagsToPermissionString(t2)) : 44;
      }, MAX_OPEN_FDS: 4096, nextfd() {
        for (var e = 0;e <= FS.MAX_OPEN_FDS; e++)
          if (!FS.streams[e])
            return e;
        throw new FS.ErrnoError(33);
      }, getStreamChecked(e) {
        var t2 = FS.getStream(e);
        if (!t2)
          throw new FS.ErrnoError(8);
        return t2;
      }, getStream: (e) => FS.streams[e], createStream(e, t2 = -1) {
        return e = Object.assign(new FS.FSStream, e), t2 == -1 && (t2 = FS.nextfd()), e.fd = t2, FS.streams[t2] = e, e;
      }, closeStream(e) {
        FS.streams[e] = null;
      }, dupStream(e, t2 = -1) {
        var r = FS.createStream(e, t2);
        return r.stream_ops?.dup?.(r), r;
      }, chrdev_stream_ops: { open(e) {
        var t2 = FS.getDevice(e.node.rdev);
        e.stream_ops = t2.stream_ops, e.stream_ops.open?.(e);
      }, llseek() {
        throw new FS.ErrnoError(70);
      } }, major: (e) => e >> 8, minor: (e) => e & 255, makedev: (e, t2) => e << 8 | t2, registerDevice(e, t2) {
        FS.devices[e] = { stream_ops: t2 };
      }, getDevice: (e) => FS.devices[e], getMounts(e) {
        for (var t2 = [], r = [e];r.length; ) {
          var a2 = r.pop();
          t2.push(a2), r.push(...a2.mounts);
        }
        return t2;
      }, syncfs(e, t2) {
        typeof e == "function" && (t2 = e, e = false), FS.syncFSRequests++, FS.syncFSRequests > 1 && err(`warning: ${FS.syncFSRequests} FS.syncfs operations in flight at once, probably just doing extra work`);
        var r = FS.getMounts(FS.root.mount), a2 = 0;
        function o4(n3) {
          return FS.syncFSRequests--, t2(n3);
        }
        function s4(n3) {
          if (n3)
            return s4.errored ? undefined : (s4.errored = true, o4(n3));
          ++a2 >= r.length && o4(null);
        }
        r.forEach((n3) => {
          if (!n3.type.syncfs)
            return s4(null);
          n3.type.syncfs(n3, e, s4);
        });
      }, mount(e, t2, r) {
        var a2 = r === "/", o4 = !r, s4;
        if (a2 && FS.root)
          throw new FS.ErrnoError(10);
        if (!a2 && !o4) {
          var n3 = FS.lookupPath(r, { follow_mount: false });
          if (r = n3.path, s4 = n3.node, FS.isMountpoint(s4))
            throw new FS.ErrnoError(10);
          if (!FS.isDir(s4.mode))
            throw new FS.ErrnoError(54);
        }
        var _3 = { type: e, opts: t2, mountpoint: r, mounts: [] }, l3 = e.mount(_3);
        return l3.mount = _3, _3.root = l3, a2 ? FS.root = l3 : s4 && (s4.mounted = _3, s4.mount && s4.mount.mounts.push(_3)), l3;
      }, unmount(e) {
        var t2 = FS.lookupPath(e, { follow_mount: false });
        if (!FS.isMountpoint(t2.node))
          throw new FS.ErrnoError(28);
        var r = t2.node, a2 = r.mounted, o4 = FS.getMounts(a2);
        Object.keys(FS.nameTable).forEach((n3) => {
          for (var _3 = FS.nameTable[n3];_3; ) {
            var l3 = _3.name_next;
            o4.includes(_3.mount) && FS.destroyNode(_3), _3 = l3;
          }
        }), r.mounted = null;
        var s4 = r.mount.mounts.indexOf(a2);
        r.mount.mounts.splice(s4, 1);
      }, lookup(e, t2) {
        return e.node_ops.lookup(e, t2);
      }, mknod(e, t2, r) {
        var a2 = FS.lookupPath(e, { parent: true }), o4 = a2.node, s4 = PATH.basename(e);
        if (!s4 || s4 === "." || s4 === "..")
          throw new FS.ErrnoError(28);
        var n3 = FS.mayCreate(o4, s4);
        if (n3)
          throw new FS.ErrnoError(n3);
        if (!o4.node_ops.mknod)
          throw new FS.ErrnoError(63);
        return o4.node_ops.mknod(o4, s4, t2, r);
      }, statfs(e) {
        var t2 = { bsize: 4096, frsize: 4096, blocks: 1e6, bfree: 500000, bavail: 500000, files: FS.nextInode, ffree: FS.nextInode - 1, fsid: 42, flags: 2, namelen: 255 }, r = FS.lookupPath(e, { follow: true }).node;
        return r?.node_ops.statfs && Object.assign(t2, r.node_ops.statfs(r.mount.opts.root)), t2;
      }, create(e, t2 = 438) {
        return t2 &= 4095, t2 |= 32768, FS.mknod(e, t2, 0);
      }, mkdir(e, t2 = 511) {
        return t2 &= 1023, t2 |= 16384, FS.mknod(e, t2, 0);
      }, mkdirTree(e, t2) {
        for (var r = e.split("/"), a2 = "", o4 = 0;o4 < r.length; ++o4)
          if (r[o4]) {
            a2 += "/" + r[o4];
            try {
              FS.mkdir(a2, t2);
            } catch (s4) {
              if (s4.errno != 20)
                throw s4;
            }
          }
      }, mkdev(e, t2, r) {
        return typeof r > "u" && (r = t2, t2 = 438), t2 |= 8192, FS.mknod(e, t2, r);
      }, symlink(e, t2) {
        if (!PATH_FS.resolve(e))
          throw new FS.ErrnoError(44);
        var r = FS.lookupPath(t2, { parent: true }), a2 = r.node;
        if (!a2)
          throw new FS.ErrnoError(44);
        var o4 = PATH.basename(t2), s4 = FS.mayCreate(a2, o4);
        if (s4)
          throw new FS.ErrnoError(s4);
        if (!a2.node_ops.symlink)
          throw new FS.ErrnoError(63);
        return a2.node_ops.symlink(a2, o4, e);
      }, rename(e, t2) {
        var r = PATH.dirname(e), a2 = PATH.dirname(t2), o4 = PATH.basename(e), s4 = PATH.basename(t2), n3, _3, l3;
        if (n3 = FS.lookupPath(e, { parent: true }), _3 = n3.node, n3 = FS.lookupPath(t2, { parent: true }), l3 = n3.node, !_3 || !l3)
          throw new FS.ErrnoError(44);
        if (_3.mount !== l3.mount)
          throw new FS.ErrnoError(75);
        var p4 = FS.lookupNode(_3, o4), m4 = PATH_FS.relative(e, a2);
        if (m4.charAt(0) !== ".")
          throw new FS.ErrnoError(28);
        if (m4 = PATH_FS.relative(t2, r), m4.charAt(0) !== ".")
          throw new FS.ErrnoError(55);
        var d2;
        try {
          d2 = FS.lookupNode(l3, s4);
        } catch {}
        if (p4 !== d2) {
          var g5 = FS.isDir(p4.mode), u2 = FS.mayDelete(_3, o4, g5);
          if (u2)
            throw new FS.ErrnoError(u2);
          if (u2 = d2 ? FS.mayDelete(l3, s4, g5) : FS.mayCreate(l3, s4), u2)
            throw new FS.ErrnoError(u2);
          if (!_3.node_ops.rename)
            throw new FS.ErrnoError(63);
          if (FS.isMountpoint(p4) || d2 && FS.isMountpoint(d2))
            throw new FS.ErrnoError(10);
          if (l3 !== _3 && (u2 = FS.nodePermissions(_3, "w"), u2))
            throw new FS.ErrnoError(u2);
          FS.hashRemoveNode(p4);
          try {
            _3.node_ops.rename(p4, l3, s4), p4.parent = l3;
          } catch (f3) {
            throw f3;
          } finally {
            FS.hashAddNode(p4);
          }
        }
      }, rmdir(e) {
        var t2 = FS.lookupPath(e, { parent: true }), r = t2.node, a2 = PATH.basename(e), o4 = FS.lookupNode(r, a2), s4 = FS.mayDelete(r, a2, true);
        if (s4)
          throw new FS.ErrnoError(s4);
        if (!r.node_ops.rmdir)
          throw new FS.ErrnoError(63);
        if (FS.isMountpoint(o4))
          throw new FS.ErrnoError(10);
        r.node_ops.rmdir(r, a2), FS.destroyNode(o4);
      }, readdir(e) {
        var t2 = FS.lookupPath(e, { follow: true }), r = t2.node;
        if (!r.node_ops.readdir)
          throw new FS.ErrnoError(54);
        return r.node_ops.readdir(r);
      }, unlink(e) {
        var t2 = FS.lookupPath(e, { parent: true }), r = t2.node;
        if (!r)
          throw new FS.ErrnoError(44);
        var a2 = PATH.basename(e), o4 = FS.lookupNode(r, a2), s4 = FS.mayDelete(r, a2, false);
        if (s4)
          throw new FS.ErrnoError(s4);
        if (!r.node_ops.unlink)
          throw new FS.ErrnoError(63);
        if (FS.isMountpoint(o4))
          throw new FS.ErrnoError(10);
        r.node_ops.unlink(r, a2), FS.destroyNode(o4);
      }, readlink(e) {
        var t2 = FS.lookupPath(e), r = t2.node;
        if (!r)
          throw new FS.ErrnoError(44);
        if (!r.node_ops.readlink)
          throw new FS.ErrnoError(28);
        return r.node_ops.readlink(r);
      }, stat(e, t2) {
        var r = FS.lookupPath(e, { follow: !t2 }), a2 = r.node;
        if (!a2)
          throw new FS.ErrnoError(44);
        if (!a2.node_ops.getattr)
          throw new FS.ErrnoError(63);
        return a2.node_ops.getattr(a2);
      }, lstat(e) {
        return FS.stat(e, true);
      }, chmod(e, t2, r) {
        var a2;
        if (typeof e == "string") {
          var o4 = FS.lookupPath(e, { follow: !r });
          a2 = o4.node;
        } else
          a2 = e;
        if (!a2.node_ops.setattr)
          throw new FS.ErrnoError(63);
        a2.node_ops.setattr(a2, { mode: t2 & 4095 | a2.mode & -4096, ctime: Date.now() });
      }, lchmod(e, t2) {
        FS.chmod(e, t2, true);
      }, fchmod(e, t2) {
        var r = FS.getStreamChecked(e);
        FS.chmod(r.node, t2);
      }, chown(e, t2, r, a2) {
        var o4;
        if (typeof e == "string") {
          var s4 = FS.lookupPath(e, { follow: !a2 });
          o4 = s4.node;
        } else
          o4 = e;
        if (!o4.node_ops.setattr)
          throw new FS.ErrnoError(63);
        o4.node_ops.setattr(o4, { timestamp: Date.now() });
      }, lchown(e, t2, r) {
        FS.chown(e, t2, r, true);
      }, fchown(e, t2, r) {
        var a2 = FS.getStreamChecked(e);
        FS.chown(a2.node, t2, r);
      }, truncate(e, t2) {
        if (t2 < 0)
          throw new FS.ErrnoError(28);
        var r;
        if (typeof e == "string") {
          var a2 = FS.lookupPath(e, { follow: true });
          r = a2.node;
        } else
          r = e;
        if (!r.node_ops.setattr)
          throw new FS.ErrnoError(63);
        if (FS.isDir(r.mode))
          throw new FS.ErrnoError(31);
        if (!FS.isFile(r.mode))
          throw new FS.ErrnoError(28);
        var o4 = FS.nodePermissions(r, "w");
        if (o4)
          throw new FS.ErrnoError(o4);
        r.node_ops.setattr(r, { size: t2, timestamp: Date.now() });
      }, ftruncate(e, t2) {
        var r = FS.getStreamChecked(e);
        if (!(r.flags & 2097155))
          throw new FS.ErrnoError(28);
        FS.truncate(r.node, t2);
      }, utime(e, t2, r) {
        var a2 = FS.lookupPath(e, { follow: true }), o4 = a2.node;
        o4.node_ops.setattr(o4, { atime: t2, mtime: r });
      }, open(e, t2, r = 438) {
        if (e === "")
          throw new FS.ErrnoError(44);
        t2 = typeof t2 == "string" ? FS_modeStringToFlags(t2) : t2, t2 & 64 ? r = r & 4095 | 32768 : r = 0;
        var a2;
        if (typeof e == "object")
          a2 = e;
        else {
          var o4 = FS.lookupPath(e, { follow: !(t2 & 131072), noent_okay: true });
          a2 = o4.node, e = o4.path;
        }
        var s4 = false;
        if (t2 & 64)
          if (a2) {
            if (t2 & 128)
              throw new FS.ErrnoError(20);
          } else
            a2 = FS.mknod(e, r, 0), s4 = true;
        if (!a2)
          throw new FS.ErrnoError(44);
        if (FS.isChrdev(a2.mode) && (t2 &= -513), t2 & 65536 && !FS.isDir(a2.mode))
          throw new FS.ErrnoError(54);
        if (!s4) {
          var n3 = FS.mayOpen(a2, t2);
          if (n3)
            throw new FS.ErrnoError(n3);
        }
        t2 & 512 && !s4 && FS.truncate(a2, 0), t2 &= -131713;
        var _3 = FS.createStream({ node: a2, path: FS.getPath(a2), flags: t2, seekable: true, position: 0, stream_ops: a2.stream_ops, ungotten: [], error: false });
        return _3.stream_ops.open && _3.stream_ops.open(_3), Module.logReadFiles && !(t2 & 1) && ((e in FS.readFiles) || (FS.readFiles[e] = 1)), _3;
      }, close(e) {
        if (FS.isClosed(e))
          throw new FS.ErrnoError(8);
        e.getdents && (e.getdents = null);
        try {
          e.stream_ops.close && e.stream_ops.close(e);
        } catch (t2) {
          throw t2;
        } finally {
          FS.closeStream(e.fd);
        }
        e.fd = null;
      }, isClosed(e) {
        return e.fd === null;
      }, llseek(e, t2, r) {
        if (FS.isClosed(e))
          throw new FS.ErrnoError(8);
        if (!e.seekable || !e.stream_ops.llseek)
          throw new FS.ErrnoError(70);
        if (r != 0 && r != 1 && r != 2)
          throw new FS.ErrnoError(28);
        return e.position = e.stream_ops.llseek(e, t2, r), e.ungotten = [], e.position;
      }, read(e, t2, r, a2, o4) {
        if (a2 < 0 || o4 < 0)
          throw new FS.ErrnoError(28);
        if (FS.isClosed(e))
          throw new FS.ErrnoError(8);
        if ((e.flags & 2097155) === 1)
          throw new FS.ErrnoError(8);
        if (FS.isDir(e.node.mode))
          throw new FS.ErrnoError(31);
        if (!e.stream_ops.read)
          throw new FS.ErrnoError(28);
        var s4 = typeof o4 < "u";
        if (!s4)
          o4 = e.position;
        else if (!e.seekable)
          throw new FS.ErrnoError(70);
        var n3 = e.stream_ops.read(e, t2, r, a2, o4);
        return s4 || (e.position += n3), n3;
      }, write(e, t2, r, a2, o4, s4) {
        if (a2 < 0 || o4 < 0)
          throw new FS.ErrnoError(28);
        if (FS.isClosed(e))
          throw new FS.ErrnoError(8);
        if (!(e.flags & 2097155))
          throw new FS.ErrnoError(8);
        if (FS.isDir(e.node.mode))
          throw new FS.ErrnoError(31);
        if (!e.stream_ops.write)
          throw new FS.ErrnoError(28);
        e.seekable && e.flags & 1024 && FS.llseek(e, 0, 2);
        var n3 = typeof o4 < "u";
        if (!n3)
          o4 = e.position;
        else if (!e.seekable)
          throw new FS.ErrnoError(70);
        var _3 = e.stream_ops.write(e, t2, r, a2, o4, s4);
        return n3 || (e.position += _3), _3;
      }, allocate(e, t2, r) {
        if (FS.isClosed(e))
          throw new FS.ErrnoError(8);
        if (t2 < 0 || r <= 0)
          throw new FS.ErrnoError(28);
        if (!(e.flags & 2097155))
          throw new FS.ErrnoError(8);
        if (!FS.isFile(e.node.mode) && !FS.isDir(e.node.mode))
          throw new FS.ErrnoError(43);
        if (!e.stream_ops.allocate)
          throw new FS.ErrnoError(138);
        e.stream_ops.allocate(e, t2, r);
      }, mmap(e, t2, r, a2, o4) {
        if (a2 & 2 && !(o4 & 2) && (e.flags & 2097155) !== 2)
          throw new FS.ErrnoError(2);
        if ((e.flags & 2097155) === 1)
          throw new FS.ErrnoError(2);
        if (!e.stream_ops.mmap)
          throw new FS.ErrnoError(43);
        if (!t2)
          throw new FS.ErrnoError(28);
        return e.stream_ops.mmap(e, t2, r, a2, o4);
      }, msync(e, t2, r, a2, o4) {
        return e.stream_ops.msync ? e.stream_ops.msync(e, t2, r, a2, o4) : 0;
      }, ioctl(e, t2, r) {
        if (!e.stream_ops.ioctl)
          throw new FS.ErrnoError(59);
        return e.stream_ops.ioctl(e, t2, r);
      }, readFile(e, t2 = {}) {
        if (t2.flags = t2.flags || 0, t2.encoding = t2.encoding || "binary", t2.encoding !== "utf8" && t2.encoding !== "binary")
          throw new Error(`Invalid encoding type "${t2.encoding}"`);
        var r, a2 = FS.open(e, t2.flags), o4 = FS.stat(e), s4 = o4.size, n3 = new Uint8Array(s4);
        return FS.read(a2, n3, 0, s4, 0), t2.encoding === "utf8" ? r = UTF8ArrayToString(n3) : t2.encoding === "binary" && (r = n3), FS.close(a2), r;
      }, writeFile(e, t2, r = {}) {
        r.flags = r.flags || 577;
        var a2 = FS.open(e, r.flags, r.mode);
        if (typeof t2 == "string") {
          var o4 = new Uint8Array(lengthBytesUTF8(t2) + 1), s4 = stringToUTF8Array(t2, o4, 0, o4.length);
          FS.write(a2, o4, 0, s4, undefined, r.canOwn);
        } else if (ArrayBuffer.isView(t2))
          FS.write(a2, t2, 0, t2.byteLength, undefined, r.canOwn);
        else
          throw new Error("Unsupported data type");
        FS.close(a2);
      }, cwd: () => FS.currentPath, chdir(e) {
        var t2 = FS.lookupPath(e, { follow: true });
        if (t2.node === null)
          throw new FS.ErrnoError(44);
        if (!FS.isDir(t2.node.mode))
          throw new FS.ErrnoError(54);
        var r = FS.nodePermissions(t2.node, "x");
        if (r)
          throw new FS.ErrnoError(r);
        FS.currentPath = t2.path;
      }, createDefaultDirectories() {
        FS.mkdir("/tmp"), FS.mkdir("/home"), FS.mkdir("/home/web_user");
      }, createDefaultDevices() {
        FS.mkdir("/dev"), FS.registerDevice(FS.makedev(1, 3), { read: () => 0, write: (a2, o4, s4, n3, _3) => n3, llseek: () => 0 }), FS.mkdev("/dev/null", FS.makedev(1, 3)), TTY.register(FS.makedev(5, 0), TTY.default_tty_ops), TTY.register(FS.makedev(6, 0), TTY.default_tty1_ops), FS.mkdev("/dev/tty", FS.makedev(5, 0)), FS.mkdev("/dev/tty1", FS.makedev(6, 0));
        var e = new Uint8Array(1024), t2 = 0, r = () => (t2 === 0 && (t2 = randomFill(e).byteLength), e[--t2]);
        FS.createDevice("/dev", "random", r), FS.createDevice("/dev", "urandom", r), FS.mkdir("/dev/shm"), FS.mkdir("/dev/shm/tmp");
      }, createSpecialDirectories() {
        FS.mkdir("/proc");
        var e = FS.mkdir("/proc/self");
        FS.mkdir("/proc/self/fd"), FS.mount({ mount() {
          var t2 = FS.createNode(e, "fd", 16895, 73);
          return t2.stream_ops = { llseek: MEMFS.stream_ops.llseek }, t2.node_ops = { lookup(r, a2) {
            var o4 = +a2, s4 = FS.getStreamChecked(o4), n3 = { parent: null, mount: { mountpoint: "fake" }, node_ops: { readlink: () => s4.path }, id: o4 + 1 };
            return n3.parent = n3, n3;
          }, readdir() {
            return Array.from(FS.streams.entries()).filter(([r, a2]) => a2).map(([r, a2]) => r.toString());
          } }, t2;
        } }, {}, "/proc/self/fd");
      }, createStandardStreams(e, t2, r) {
        e ? FS.createDevice("/dev", "stdin", e) : FS.symlink("/dev/tty", "/dev/stdin"), t2 ? FS.createDevice("/dev", "stdout", null, t2) : FS.symlink("/dev/tty", "/dev/stdout"), r ? FS.createDevice("/dev", "stderr", null, r) : FS.symlink("/dev/tty1", "/dev/stderr");
        var a2 = FS.open("/dev/stdin", 0), o4 = FS.open("/dev/stdout", 1), s4 = FS.open("/dev/stderr", 1);
      }, staticInit() {
        FS.nameTable = new Array(4096), FS.mount(MEMFS, {}, "/"), FS.createDefaultDirectories(), FS.createDefaultDevices(), FS.createSpecialDirectories(), FS.filesystems = { MEMFS, IDBFS, NODEFS };
      }, init(e, t2, r) {
        FS.initialized = true, e ?? (e = Module.stdin), t2 ?? (t2 = Module.stdout), r ?? (r = Module.stderr), FS.createStandardStreams(e, t2, r);
      }, quit() {
        FS.initialized = false, _fflush(0);
        for (var e = 0;e < FS.streams.length; e++) {
          var t2 = FS.streams[e];
          t2 && FS.close(t2);
        }
      }, findObject(e, t2) {
        var r = FS.analyzePath(e, t2);
        return r.exists ? r.object : null;
      }, analyzePath(e, t2) {
        try {
          var r = FS.lookupPath(e, { follow: !t2 });
          e = r.path;
        } catch {}
        var a2 = { isRoot: false, exists: false, error: 0, name: null, path: null, object: null, parentExists: false, parentPath: null, parentObject: null };
        try {
          var r = FS.lookupPath(e, { parent: true });
          a2.parentExists = true, a2.parentPath = r.path, a2.parentObject = r.node, a2.name = PATH.basename(e), r = FS.lookupPath(e, { follow: !t2 }), a2.exists = true, a2.path = r.path, a2.object = r.node, a2.name = r.node.name, a2.isRoot = r.path === "/";
        } catch (o4) {
          a2.error = o4.errno;
        }
        return a2;
      }, createPath(e, t2, r, a2) {
        e = typeof e == "string" ? e : FS.getPath(e);
        for (var o4 = t2.split("/").reverse();o4.length; ) {
          var s4 = o4.pop();
          if (s4) {
            var n3 = PATH.join2(e, s4);
            try {
              FS.mkdir(n3);
            } catch {}
            e = n3;
          }
        }
        return n3;
      }, createFile(e, t2, r, a2, o4) {
        var s4 = PATH.join2(typeof e == "string" ? e : FS.getPath(e), t2), n3 = FS_getMode(a2, o4);
        return FS.create(s4, n3);
      }, createDataFile(e, t2, r, a2, o4, s4) {
        var n3 = t2;
        e && (e = typeof e == "string" ? e : FS.getPath(e), n3 = t2 ? PATH.join2(e, t2) : e);
        var _3 = FS_getMode(a2, o4), l3 = FS.create(n3, _3);
        if (r) {
          if (typeof r == "string") {
            for (var p4 = new Array(r.length), m4 = 0, d2 = r.length;m4 < d2; ++m4)
              p4[m4] = r.charCodeAt(m4);
            r = p4;
          }
          FS.chmod(l3, _3 | 146);
          var g5 = FS.open(l3, 577);
          FS.write(g5, r, 0, r.length, 0, s4), FS.close(g5), FS.chmod(l3, _3);
        }
      }, createDevice(e, t2, r, a2) {
        var _3;
        var o4 = PATH.join2(typeof e == "string" ? e : FS.getPath(e), t2), s4 = FS_getMode(!!r, !!a2);
        (_3 = FS.createDevice).major ?? (_3.major = 64);
        var n3 = FS.makedev(FS.createDevice.major++, 0);
        return FS.registerDevice(n3, { open(l3) {
          l3.seekable = false;
        }, close(l3) {
          a2?.buffer?.length && a2(10);
        }, read(l3, p4, m4, d2, g5) {
          for (var u2 = 0, f3 = 0;f3 < d2; f3++) {
            var c2;
            try {
              c2 = r();
            } catch {
              throw new FS.ErrnoError(29);
            }
            if (c2 === undefined && u2 === 0)
              throw new FS.ErrnoError(6);
            if (c2 == null)
              break;
            u2++, p4[m4 + f3] = c2;
          }
          return u2 && (l3.node.atime = Date.now()), u2;
        }, write(l3, p4, m4, d2, g5) {
          for (var u2 = 0;u2 < d2; u2++)
            try {
              a2(p4[m4 + u2]);
            } catch {
              throw new FS.ErrnoError(29);
            }
          return d2 && (l3.node.mtime = l3.node.ctime = Date.now()), u2;
        } }), FS.mkdev(o4, s4, n3);
      }, forceLoadFile(e) {
        if (e.isDevice || e.isFolder || e.link || e.contents)
          return true;
        if (typeof XMLHttpRequest < "u")
          throw new Error("Lazy loading should have been performed (contents set) in createLazyFile, but it was not. Lazy loading only works in web workers. Use --embed-file or --preload-file in emcc on the main thread.");
        try {
          e.contents = readBinary(e.url), e.usedBytes = e.contents.length;
        } catch {
          throw new FS.ErrnoError(29);
        }
      }, createLazyFile(e, t2, r, a2, o4) {

        class s4 {
          constructor() {
            P(this, "lengthKnown", false);
            P(this, "chunks", []);
          }
          get(u2) {
            if (!(u2 > this.length - 1 || u2 < 0)) {
              var f3 = u2 % this.chunkSize, c2 = u2 / this.chunkSize | 0;
              return this.getter(c2)[f3];
            }
          }
          setDataGetter(u2) {
            this.getter = u2;
          }
          cacheLength() {
            var u2 = new XMLHttpRequest;
            if (u2.open("HEAD", r, false), u2.send(null), !(u2.status >= 200 && u2.status < 300 || u2.status === 304))
              throw new Error("Couldn't load " + r + ". Status: " + u2.status);
            var f3 = Number(u2.getResponseHeader("Content-length")), c2, w4 = (c2 = u2.getResponseHeader("Accept-Ranges")) && c2 === "bytes", x6 = (c2 = u2.getResponseHeader("Content-Encoding")) && c2 === "gzip", S3 = 1048576;
            w4 || (S3 = f3);
            var v3 = (M2, y4) => {
              if (M2 > y4)
                throw new Error("invalid range (" + M2 + ", " + y4 + ") or no bytes requested!");
              if (y4 > f3 - 1)
                throw new Error("only " + f3 + " bytes available! programmer error!");
              var F4 = new XMLHttpRequest;
              if (F4.open("GET", r, false), f3 !== S3 && F4.setRequestHeader("Range", "bytes=" + M2 + "-" + y4), F4.responseType = "arraybuffer", F4.overrideMimeType && F4.overrideMimeType("text/plain; charset=x-user-defined"), F4.send(null), !(F4.status >= 200 && F4.status < 300 || F4.status === 304))
                throw new Error("Couldn't load " + r + ". Status: " + F4.status);
              return F4.response !== undefined ? new Uint8Array(F4.response || []) : intArrayFromString(F4.responseText || "", true);
            }, b3 = this;
            b3.setDataGetter((M2) => {
              var y4 = M2 * S3, F4 = (M2 + 1) * S3 - 1;
              if (F4 = Math.min(F4, f3 - 1), typeof b3.chunks[M2] > "u" && (b3.chunks[M2] = v3(y4, F4)), typeof b3.chunks[M2] > "u")
                throw new Error("doXHR failed!");
              return b3.chunks[M2];
            }), (x6 || !f3) && (S3 = f3 = 1, f3 = this.getter(0).length, S3 = f3, out("LazyFiles on gzip forces download of the whole file when length is accessed")), this._length = f3, this._chunkSize = S3, this.lengthKnown = true;
          }
          get length() {
            return this.lengthKnown || this.cacheLength(), this._length;
          }
          get chunkSize() {
            return this.lengthKnown || this.cacheLength(), this._chunkSize;
          }
        }
        if (typeof XMLHttpRequest < "u") {
          if (!ENVIRONMENT_IS_WORKER)
            throw "Cannot do synchronous binary XHRs outside webworkers in modern browsers. Use --embed-file or --preload-file in emcc";
          var n3 = new s4, _3 = { isDevice: false, contents: n3 };
        } else
          var _3 = { isDevice: false, url: r };
        var l3 = FS.createFile(e, t2, _3, a2, o4);
        _3.contents ? l3.contents = _3.contents : _3.url && (l3.contents = null, l3.url = _3.url), Object.defineProperties(l3, { usedBytes: { get: function() {
          return this.contents.length;
        } } });
        var p4 = {}, m4 = Object.keys(l3.stream_ops);
        m4.forEach((g5) => {
          var u2 = l3.stream_ops[g5];
          p4[g5] = (...f3) => (FS.forceLoadFile(l3), u2(...f3));
        });
        function d2(g5, u2, f3, c2, w4) {
          var x6 = g5.node.contents;
          if (w4 >= x6.length)
            return 0;
          var S3 = Math.min(x6.length - w4, c2);
          if (x6.slice)
            for (var v3 = 0;v3 < S3; v3++)
              u2[f3 + v3] = x6[w4 + v3];
          else
            for (var v3 = 0;v3 < S3; v3++)
              u2[f3 + v3] = x6.get(w4 + v3);
          return S3;
        }
        return p4.read = (g5, u2, f3, c2, w4) => (FS.forceLoadFile(l3), d2(g5, u2, f3, c2, w4)), p4.mmap = (g5, u2, f3, c2, w4) => {
          FS.forceLoadFile(l3);
          var x6 = mmapAlloc(u2);
          if (!x6)
            throw new FS.ErrnoError(48);
          return d2(g5, HEAP8, x6, u2, f3), { ptr: x6, allocated: true };
        }, l3.stream_ops = p4, l3;
      } }, SYSCALLS = { DEFAULT_POLLMASK: 5, calculateAt(e, t2, r) {
        if (PATH.isAbs(t2))
          return t2;
        var a2;
        if (e === -100)
          a2 = FS.cwd();
        else {
          var o4 = SYSCALLS.getStreamFromFD(e);
          a2 = o4.path;
        }
        if (t2.length == 0) {
          if (!r)
            throw new FS.ErrnoError(44);
          return a2;
        }
        return a2 + "/" + t2;
      }, doStat(e, t2, r) {
        var a2 = e(t2);
        HEAP32[r >> 2] = a2.dev, HEAP32[r + 4 >> 2] = a2.mode, HEAPU32[r + 8 >> 2] = a2.nlink, HEAP32[r + 12 >> 2] = a2.uid, HEAP32[r + 16 >> 2] = a2.gid, HEAP32[r + 20 >> 2] = a2.rdev, HEAP64[r + 24 >> 3] = BigInt(a2.size), HEAP32[r + 32 >> 2] = 4096, HEAP32[r + 36 >> 2] = a2.blocks;
        var o4 = a2.atime.getTime(), s4 = a2.mtime.getTime(), n3 = a2.ctime.getTime();
        return HEAP64[r + 40 >> 3] = BigInt(Math.floor(o4 / 1000)), HEAPU32[r + 48 >> 2] = o4 % 1000 * 1000 * 1000, HEAP64[r + 56 >> 3] = BigInt(Math.floor(s4 / 1000)), HEAPU32[r + 64 >> 2] = s4 % 1000 * 1000 * 1000, HEAP64[r + 72 >> 3] = BigInt(Math.floor(n3 / 1000)), HEAPU32[r + 80 >> 2] = n3 % 1000 * 1000 * 1000, HEAP64[r + 88 >> 3] = BigInt(a2.ino), 0;
      }, doMsync(e, t2, r, a2, o4) {
        if (!FS.isFile(t2.node.mode))
          throw new FS.ErrnoError(43);
        if (a2 & 2)
          return 0;
        var s4 = HEAPU8.slice(e, e + r);
        FS.msync(t2, s4, o4, r, a2);
      }, getStreamFromFD(e) {
        var t2 = FS.getStreamChecked(e);
        return t2;
      }, varargs: undefined, getStr(e) {
        var t2 = UTF8ToString(e);
        return t2;
      } }, ___syscall__newselect = function(e, t2, r, a2, o4) {
        try {
          for (var s4 = 0, n3 = t2 ? HEAP32[t2 >> 2] : 0, _3 = t2 ? HEAP32[t2 + 4 >> 2] : 0, l3 = r ? HEAP32[r >> 2] : 0, p4 = r ? HEAP32[r + 4 >> 2] : 0, m4 = a2 ? HEAP32[a2 >> 2] : 0, d2 = a2 ? HEAP32[a2 + 4 >> 2] : 0, g5 = 0, u2 = 0, f3 = 0, c2 = 0, w4 = 0, x6 = 0, S3 = (t2 ? HEAP32[t2 >> 2] : 0) | (r ? HEAP32[r >> 2] : 0) | (a2 ? HEAP32[a2 >> 2] : 0), v3 = (t2 ? HEAP32[t2 + 4 >> 2] : 0) | (r ? HEAP32[r + 4 >> 2] : 0) | (a2 ? HEAP32[a2 + 4 >> 2] : 0), b3 = (H4, A2, D4, T5) => H4 < 32 ? A2 & T5 : D4 & T5, M2 = 0;M2 < e; M2++) {
            var y4 = 1 << M2 % 32;
            if (b3(M2, S3, v3, y4)) {
              var F4 = SYSCALLS.getStreamFromFD(M2), R3 = SYSCALLS.DEFAULT_POLLMASK;
              if (F4.stream_ops.poll) {
                var U3 = -1;
                if (o4) {
                  var ee2 = t2 ? HEAP32[o4 >> 2] : 0, N2 = t2 ? HEAP32[o4 + 4 >> 2] : 0;
                  U3 = (ee2 + N2 / 1e6) * 1000;
                }
                R3 = F4.stream_ops.poll(F4, U3);
              }
              R3 & 1 && b3(M2, n3, _3, y4) && (M2 < 32 ? g5 = g5 | y4 : u2 = u2 | y4, s4++), R3 & 4 && b3(M2, l3, p4, y4) && (M2 < 32 ? f3 = f3 | y4 : c2 = c2 | y4, s4++), R3 & 2 && b3(M2, m4, d2, y4) && (M2 < 32 ? w4 = w4 | y4 : x6 = x6 | y4, s4++);
            }
          }
          return t2 && (HEAP32[t2 >> 2] = g5, HEAP32[t2 + 4 >> 2] = u2), r && (HEAP32[r >> 2] = f3, HEAP32[r + 4 >> 2] = c2), a2 && (HEAP32[a2 >> 2] = w4, HEAP32[a2 + 4 >> 2] = x6), s4;
        } catch (H4) {
          if (typeof FS > "u" || H4.name !== "ErrnoError")
            throw H4;
          return -H4.errno;
        }
      };
      ___syscall__newselect.sig = "iipppp";
      var SOCKFS = { websocketArgs: {}, callbacks: {}, on(e, t2) {
        SOCKFS.callbacks[e] = t2;
      }, emit(e, t2) {
        SOCKFS.callbacks[e]?.(t2);
      }, mount(e) {
        return SOCKFS.websocketArgs = Module.websocket || {}, (Module.websocket ?? (Module.websocket = {})).on = SOCKFS.on, FS.createNode(null, "/", 16895, 0);
      }, createSocket(e, t2, r) {
        t2 &= -526337;
        var a2 = t2 == 1;
        if (a2 && r && r != 6)
          throw new FS.ErrnoError(66);
        var o4 = { family: e, type: t2, protocol: r, server: null, error: null, peers: {}, pending: [], recv_queue: [], sock_ops: SOCKFS.websocket_sock_ops }, s4 = SOCKFS.nextname(), n3 = FS.createNode(SOCKFS.root, s4, 49152, 0);
        n3.sock = o4;
        var _3 = FS.createStream({ path: s4, node: n3, flags: 2, seekable: false, stream_ops: SOCKFS.stream_ops });
        return o4.stream = _3, o4;
      }, getSocket(e) {
        var t2 = FS.getStream(e);
        return !t2 || !FS.isSocket(t2.node.mode) ? null : t2.node.sock;
      }, stream_ops: { poll(e) {
        var t2 = e.node.sock;
        return t2.sock_ops.poll(t2);
      }, ioctl(e, t2, r) {
        var a2 = e.node.sock;
        return a2.sock_ops.ioctl(a2, t2, r);
      }, read(e, t2, r, a2, o4) {
        var s4 = e.node.sock, n3 = s4.sock_ops.recvmsg(s4, a2);
        return n3 ? (t2.set(n3.buffer, r), n3.buffer.length) : 0;
      }, write(e, t2, r, a2, o4) {
        var s4 = e.node.sock;
        return s4.sock_ops.sendmsg(s4, t2, r, a2);
      }, close(e) {
        var t2 = e.node.sock;
        t2.sock_ops.close(t2);
      } }, nextname() {
        return SOCKFS.nextname.current || (SOCKFS.nextname.current = 0), `socket[${SOCKFS.nextname.current++}]`;
      }, websocket_sock_ops: { createPeer(e, t2, r) {
        var a2;
        if (typeof t2 == "object" && (a2 = t2, t2 = null, r = null), a2)
          if (a2._socket)
            t2 = a2._socket.remoteAddress, r = a2._socket.remotePort;
          else {
            var o4 = /ws[s]?:\/\/([^:]+):(\d+)/.exec(a2.url);
            if (!o4)
              throw new Error("WebSocket URL must be in the format ws(s)://address:port");
            t2 = o4[1], r = parseInt(o4[2], 10);
          }
        else
          try {
            var s4 = "ws:#".replace("#", "//"), n3 = "binary", _3 = undefined;
            if (SOCKFS.websocketArgs.url && (s4 = SOCKFS.websocketArgs.url), SOCKFS.websocketArgs.subprotocol ? n3 = SOCKFS.websocketArgs.subprotocol : SOCKFS.websocketArgs.subprotocol === null && (n3 = "null"), s4 === "ws://" || s4 === "wss://") {
              var l3 = t2.split("/");
              s4 = s4 + l3[0] + ":" + r + "/" + l3.slice(1).join("/");
            }
            n3 !== "null" && (n3 = n3.replace(/^ +| +$/g, "").split(/ *, */), _3 = n3);
            var p4;
            ENVIRONMENT_IS_NODE ? p4 = require("ws") : p4 = WebSocket, a2 = new p4(s4, _3), a2.binaryType = "arraybuffer";
          } catch {
            throw new FS.ErrnoError(23);
          }
        var m4 = { addr: t2, port: r, socket: a2, msg_send_queue: [] };
        return SOCKFS.websocket_sock_ops.addPeer(e, m4), SOCKFS.websocket_sock_ops.handlePeerEvents(e, m4), e.type === 2 && typeof e.sport < "u" && m4.msg_send_queue.push(new Uint8Array([255, 255, 255, 255, 112, 111, 114, 116, (e.sport & 65280) >> 8, e.sport & 255])), m4;
      }, getPeer(e, t2, r) {
        return e.peers[t2 + ":" + r];
      }, addPeer(e, t2) {
        e.peers[t2.addr + ":" + t2.port] = t2;
      }, removePeer(e, t2) {
        delete e.peers[t2.addr + ":" + t2.port];
      }, handlePeerEvents(e, t2) {
        var r = true, a2 = function() {
          e.connecting = false, SOCKFS.emit("open", e.stream.fd);
          try {
            for (var s4 = t2.msg_send_queue.shift();s4; )
              t2.socket.send(s4), s4 = t2.msg_send_queue.shift();
          } catch {
            t2.socket.close();
          }
        };
        function o4(s4) {
          if (typeof s4 == "string") {
            var n3 = new TextEncoder;
            s4 = n3.encode(s4);
          } else {
            if (assert(s4.byteLength !== undefined), s4.byteLength == 0)
              return;
            s4 = new Uint8Array(s4);
          }
          var _3 = r;
          if (r = false, _3 && s4.length === 10 && s4[0] === 255 && s4[1] === 255 && s4[2] === 255 && s4[3] === 255 && s4[4] === 112 && s4[5] === 111 && s4[6] === 114 && s4[7] === 116) {
            var l3 = s4[8] << 8 | s4[9];
            SOCKFS.websocket_sock_ops.removePeer(e, t2), t2.port = l3, SOCKFS.websocket_sock_ops.addPeer(e, t2);
            return;
          }
          e.recv_queue.push({ addr: t2.addr, port: t2.port, data: s4 }), SOCKFS.emit("message", e.stream.fd);
        }
        ENVIRONMENT_IS_NODE ? (t2.socket.on("open", a2), t2.socket.on("message", function(s4, n3) {
          n3 && o4(new Uint8Array(s4).buffer);
        }), t2.socket.on("close", function() {
          SOCKFS.emit("close", e.stream.fd);
        }), t2.socket.on("error", function(s4) {
          e.error = 14, SOCKFS.emit("error", [e.stream.fd, e.error, "ECONNREFUSED: Connection refused"]);
        })) : (t2.socket.onopen = a2, t2.socket.onclose = function() {
          SOCKFS.emit("close", e.stream.fd);
        }, t2.socket.onmessage = function(n3) {
          o4(n3.data);
        }, t2.socket.onerror = function(s4) {
          e.error = 14, SOCKFS.emit("error", [e.stream.fd, e.error, "ECONNREFUSED: Connection refused"]);
        });
      }, poll(e) {
        if (e.type === 1 && e.server)
          return e.pending.length ? 65 : 0;
        var t2 = 0, r = e.type === 1 ? SOCKFS.websocket_sock_ops.getPeer(e, e.daddr, e.dport) : null;
        return (e.recv_queue.length || !r || r && r.socket.readyState === r.socket.CLOSING || r && r.socket.readyState === r.socket.CLOSED) && (t2 |= 65), (!r || r && r.socket.readyState === r.socket.OPEN) && (t2 |= 4), (r && r.socket.readyState === r.socket.CLOSING || r && r.socket.readyState === r.socket.CLOSED) && (e.connecting ? t2 |= 4 : t2 |= 16), t2;
      }, ioctl(e, t2, r) {
        switch (t2) {
          case 21531:
            var a2 = 0;
            return e.recv_queue.length && (a2 = e.recv_queue[0].data.length), HEAP32[r >> 2] = a2, 0;
          default:
            return 28;
        }
      }, close(e) {
        if (e.server) {
          try {
            e.server.close();
          } catch {}
          e.server = null;
        }
        for (var t2 = Object.keys(e.peers), r = 0;r < t2.length; r++) {
          var a2 = e.peers[t2[r]];
          try {
            a2.socket.close();
          } catch {}
          SOCKFS.websocket_sock_ops.removePeer(e, a2);
        }
        return 0;
      }, bind(e, t2, r) {
        if (typeof e.saddr < "u" || typeof e.sport < "u")
          throw new FS.ErrnoError(28);
        if (e.saddr = t2, e.sport = r, e.type === 2) {
          e.server && (e.server.close(), e.server = null);
          try {
            e.sock_ops.listen(e, 0);
          } catch (a2) {
            if (a2.name !== "ErrnoError" || a2.errno !== 138)
              throw a2;
          }
        }
      }, connect(e, t2, r) {
        if (e.server)
          throw new FS.ErrnoError(138);
        if (typeof e.daddr < "u" && typeof e.dport < "u") {
          var a2 = SOCKFS.websocket_sock_ops.getPeer(e, e.daddr, e.dport);
          if (a2)
            throw a2.socket.readyState === a2.socket.CONNECTING ? new FS.ErrnoError(7) : new FS.ErrnoError(30);
        }
        var o4 = SOCKFS.websocket_sock_ops.createPeer(e, t2, r);
        e.daddr = o4.addr, e.dport = o4.port, e.connecting = true;
      }, listen(e, t2) {
        if (!ENVIRONMENT_IS_NODE)
          throw new FS.ErrnoError(138);
        if (e.server)
          throw new FS.ErrnoError(28);
        var r = require("ws").Server, a2 = e.saddr;
        e.server = new r({ host: a2, port: e.sport }), SOCKFS.emit("listen", e.stream.fd), e.server.on("connection", function(o4) {
          if (e.type === 1) {
            var s4 = SOCKFS.createSocket(e.family, e.type, e.protocol), n3 = SOCKFS.websocket_sock_ops.createPeer(s4, o4);
            s4.daddr = n3.addr, s4.dport = n3.port, e.pending.push(s4), SOCKFS.emit("connection", s4.stream.fd);
          } else
            SOCKFS.websocket_sock_ops.createPeer(e, o4), SOCKFS.emit("connection", e.stream.fd);
        }), e.server.on("close", function() {
          SOCKFS.emit("close", e.stream.fd), e.server = null;
        }), e.server.on("error", function(o4) {
          e.error = 23, SOCKFS.emit("error", [e.stream.fd, e.error, "EHOSTUNREACH: Host is unreachable"]);
        });
      }, accept(e) {
        if (!e.server || !e.pending.length)
          throw new FS.ErrnoError(28);
        var t2 = e.pending.shift();
        return t2.stream.flags = e.stream.flags, t2;
      }, getname(e, t2) {
        var r, a2;
        if (t2) {
          if (e.daddr === undefined || e.dport === undefined)
            throw new FS.ErrnoError(53);
          r = e.daddr, a2 = e.dport;
        } else
          r = e.saddr || 0, a2 = e.sport || 0;
        return { addr: r, port: a2 };
      }, sendmsg(e, t2, r, a2, o4, s4) {
        if (e.type === 2) {
          if ((o4 === undefined || s4 === undefined) && (o4 = e.daddr, s4 = e.dport), o4 === undefined || s4 === undefined)
            throw new FS.ErrnoError(17);
        } else
          o4 = e.daddr, s4 = e.dport;
        var n3 = SOCKFS.websocket_sock_ops.getPeer(e, o4, s4);
        if (e.type === 1 && (!n3 || n3.socket.readyState === n3.socket.CLOSING || n3.socket.readyState === n3.socket.CLOSED))
          throw new FS.ErrnoError(53);
        ArrayBuffer.isView(t2) && (r += t2.byteOffset, t2 = t2.buffer);
        var _3 = t2.slice(r, r + a2);
        if (!n3 || n3.socket.readyState !== n3.socket.OPEN)
          return e.type === 2 && (!n3 || n3.socket.readyState === n3.socket.CLOSING || n3.socket.readyState === n3.socket.CLOSED) && (n3 = SOCKFS.websocket_sock_ops.createPeer(e, o4, s4)), n3.msg_send_queue.push(_3), a2;
        try {
          return n3.socket.send(_3), a2;
        } catch {
          throw new FS.ErrnoError(28);
        }
      }, recvmsg(e, t2) {
        if (e.type === 1 && e.server)
          throw new FS.ErrnoError(53);
        var r = e.recv_queue.shift();
        if (!r) {
          if (e.type === 1) {
            var a2 = SOCKFS.websocket_sock_ops.getPeer(e, e.daddr, e.dport);
            if (!a2)
              throw new FS.ErrnoError(53);
            if (a2.socket.readyState === a2.socket.CLOSING || a2.socket.readyState === a2.socket.CLOSED)
              return null;
            throw new FS.ErrnoError(6);
          }
          throw new FS.ErrnoError(6);
        }
        var o4 = r.data.byteLength || r.data.length, s4 = r.data.byteOffset || 0, n3 = r.data.buffer || r.data, _3 = Math.min(t2, o4), l3 = { buffer: new Uint8Array(n3, s4, _3), addr: r.addr, port: r.port };
        if (e.type === 1 && _3 < o4) {
          var p4 = o4 - _3;
          r.data = new Uint8Array(n3, s4 + _3, p4), e.recv_queue.unshift(r);
        }
        return l3;
      } } }, getSocketFromFD = (e) => {
        var t2 = SOCKFS.getSocket(e);
        if (!t2)
          throw new FS.ErrnoError(8);
        return t2;
      }, inetNtop4 = (e) => (e & 255) + "." + (e >> 8 & 255) + "." + (e >> 16 & 255) + "." + (e >> 24 & 255), inetNtop6 = (e) => {
        var t2 = "", r = 0, a2 = 0, o4 = 0, s4 = 0, n3 = 0, _3 = 0, l3 = [e[0] & 65535, e[0] >> 16, e[1] & 65535, e[1] >> 16, e[2] & 65535, e[2] >> 16, e[3] & 65535, e[3] >> 16], p4 = true, m4 = "";
        for (_3 = 0;_3 < 5; _3++)
          if (l3[_3] !== 0) {
            p4 = false;
            break;
          }
        if (p4) {
          if (m4 = inetNtop4(l3[6] | l3[7] << 16), l3[5] === -1)
            return t2 = "::ffff:", t2 += m4, t2;
          if (l3[5] === 0)
            return t2 = "::", m4 === "0.0.0.0" && (m4 = ""), m4 === "0.0.0.1" && (m4 = "1"), t2 += m4, t2;
        }
        for (r = 0;r < 8; r++)
          l3[r] === 0 && (r - o4 > 1 && (n3 = 0), o4 = r, n3++), n3 > a2 && (a2 = n3, s4 = r - a2 + 1);
        for (r = 0;r < 8; r++) {
          if (a2 > 1 && l3[r] === 0 && r >= s4 && r < s4 + a2) {
            r === s4 && (t2 += ":", s4 === 0 && (t2 += ":"));
            continue;
          }
          t2 += Number(_ntohs(l3[r] & 65535)).toString(16), t2 += r < 7 ? ":" : "";
        }
        return t2;
      }, readSockaddr = (e, t2) => {
        var r = HEAP16[e >> 1], a2 = _ntohs(HEAPU16[e + 2 >> 1]), o4;
        switch (r) {
          case 2:
            if (t2 !== 16)
              return { errno: 28 };
            o4 = HEAP32[e + 4 >> 2], o4 = inetNtop4(o4);
            break;
          case 10:
            if (t2 !== 28)
              return { errno: 28 };
            o4 = [HEAP32[e + 8 >> 2], HEAP32[e + 12 >> 2], HEAP32[e + 16 >> 2], HEAP32[e + 20 >> 2]], o4 = inetNtop6(o4);
            break;
          default:
            return { errno: 5 };
        }
        return { family: r, addr: o4, port: a2 };
      }, inetPton4 = (e) => {
        for (var t2 = e.split("."), r = 0;r < 4; r++) {
          var a2 = Number(t2[r]);
          if (isNaN(a2))
            return null;
          t2[r] = a2;
        }
        return (t2[0] | t2[1] << 8 | t2[2] << 16 | t2[3] << 24) >>> 0;
      }, jstoi_q = (e) => parseInt(e), inetPton6 = (e) => {
        var t2, r, a2, o4, s4 = /^((?=.*::)(?!.*::.+::)(::)?([\dA-F]{1,4}:(:|\b)|){5}|([\dA-F]{1,4}:){6})((([\dA-F]{1,4}((?!\3)::|:\b|$))|(?!\2\3)){2}|(((2[0-4]|1\d|[1-9])?\d|25[0-5])\.?\b){4})$/i, n3 = [];
        if (!s4.test(e))
          return null;
        if (e === "::")
          return [0, 0, 0, 0, 0, 0, 0, 0];
        for (e.startsWith("::") ? e = e.replace("::", "Z:") : e = e.replace("::", ":Z:"), e.indexOf(".") > 0 ? (e = e.replace(new RegExp("[.]", "g"), ":"), t2 = e.split(":"), t2[t2.length - 4] = jstoi_q(t2[t2.length - 4]) + jstoi_q(t2[t2.length - 3]) * 256, t2[t2.length - 3] = jstoi_q(t2[t2.length - 2]) + jstoi_q(t2[t2.length - 1]) * 256, t2 = t2.slice(0, t2.length - 2)) : t2 = e.split(":"), a2 = 0, o4 = 0, r = 0;r < t2.length; r++)
          if (typeof t2[r] == "string")
            if (t2[r] === "Z") {
              for (o4 = 0;o4 < 8 - t2.length + 1; o4++)
                n3[r + o4] = 0;
              a2 = o4 - 1;
            } else
              n3[r + a2] = _htons(parseInt(t2[r], 16));
          else
            n3[r + a2] = t2[r];
        return [n3[1] << 16 | n3[0], n3[3] << 16 | n3[2], n3[5] << 16 | n3[4], n3[7] << 16 | n3[6]];
      }, DNS = { address_map: { id: 1, addrs: {}, names: {} }, lookup_name(e) {
        var t2 = inetPton4(e);
        if (t2 !== null || (t2 = inetPton6(e), t2 !== null))
          return e;
        var r;
        if (DNS.address_map.addrs[e])
          r = DNS.address_map.addrs[e];
        else {
          var a2 = DNS.address_map.id++;
          assert(a2 < 65535, "exceeded max address mappings of 65535"), r = "172.29." + (a2 & 255) + "." + (a2 & 65280), DNS.address_map.names[r] = e, DNS.address_map.addrs[e] = r;
        }
        return r;
      }, lookup_addr(e) {
        return DNS.address_map.names[e] ? DNS.address_map.names[e] : null;
      } }, getSocketAddress = (e, t2) => {
        var r = readSockaddr(e, t2);
        if (r.errno)
          throw new FS.ErrnoError(r.errno);
        return r.addr = DNS.lookup_addr(r.addr) || r.addr, r;
      };
      function ___syscall_bind(e, t2, r, a2, o4, s4) {
        try {
          var n3 = getSocketFromFD(e), _3 = getSocketAddress(t2, r);
          return n3.sock_ops.bind(n3, _3.addr, _3.port), 0;
        } catch (l3) {
          if (typeof FS > "u" || l3.name !== "ErrnoError")
            throw l3;
          return -l3.errno;
        }
      }
      ___syscall_bind.sig = "iippiii";
      function ___syscall_chdir(e) {
        try {
          return e = SYSCALLS.getStr(e), FS.chdir(e), 0;
        } catch (t2) {
          if (typeof FS > "u" || t2.name !== "ErrnoError")
            throw t2;
          return -t2.errno;
        }
      }
      ___syscall_chdir.sig = "ip";
      function ___syscall_chmod(e, t2) {
        try {
          return e = SYSCALLS.getStr(e), FS.chmod(e, t2), 0;
        } catch (r) {
          if (typeof FS > "u" || r.name !== "ErrnoError")
            throw r;
          return -r.errno;
        }
      }
      ___syscall_chmod.sig = "ipi";
      function ___syscall_dup(e) {
        try {
          var t2 = SYSCALLS.getStreamFromFD(e);
          return FS.dupStream(t2).fd;
        } catch (r) {
          if (typeof FS > "u" || r.name !== "ErrnoError")
            throw r;
          return -r.errno;
        }
      }
      ___syscall_dup.sig = "ii";
      function ___syscall_dup3(e, t2, r) {
        try {
          var a2 = SYSCALLS.getStreamFromFD(e);
          if (a2.fd === t2)
            return -28;
          if (t2 < 0 || t2 >= FS.MAX_OPEN_FDS)
            return -8;
          var o4 = FS.getStream(t2);
          return o4 && FS.close(o4), FS.dupStream(a2, t2).fd;
        } catch (s4) {
          if (typeof FS > "u" || s4.name !== "ErrnoError")
            throw s4;
          return -s4.errno;
        }
      }
      ___syscall_dup3.sig = "iiii";
      function ___syscall_faccessat(e, t2, r, a2) {
        try {
          if (t2 = SYSCALLS.getStr(t2), t2 = SYSCALLS.calculateAt(e, t2), r & -8)
            return -28;
          var o4 = FS.lookupPath(t2, { follow: true }), s4 = o4.node;
          if (!s4)
            return -44;
          var n3 = "";
          return r & 4 && (n3 += "r"), r & 2 && (n3 += "w"), r & 1 && (n3 += "x"), n3 && FS.nodePermissions(s4, n3) ? -2 : 0;
        } catch (_3) {
          if (typeof FS > "u" || _3.name !== "ErrnoError")
            throw _3;
          return -_3.errno;
        }
      }
      ___syscall_faccessat.sig = "iipii";
      var ___syscall_fadvise64 = (e, t2, r, a2) => 0;
      ___syscall_fadvise64.sig = "iijji";
      var INT53_MAX = 9007199254740992, INT53_MIN = -9007199254740992, bigintToI53Checked = (e) => e < INT53_MIN || e > INT53_MAX ? NaN : Number(e);
      function ___syscall_fallocate(e, t2, r, a2) {
        r = bigintToI53Checked(r), a2 = bigintToI53Checked(a2);
        try {
          if (isNaN(r))
            return 61;
          var o4 = SYSCALLS.getStreamFromFD(e);
          return FS.allocate(o4, r, a2), 0;
        } catch (s4) {
          if (typeof FS > "u" || s4.name !== "ErrnoError")
            throw s4;
          return -s4.errno;
        }
      }
      ___syscall_fallocate.sig = "iiijj";
      var syscallGetVarargI = () => {
        var e = HEAP32[+SYSCALLS.varargs >> 2];
        return SYSCALLS.varargs += 4, e;
      }, syscallGetVarargP = syscallGetVarargI;
      function ___syscall_fcntl64(e, t2, r) {
        SYSCALLS.varargs = r;
        try {
          var a2 = SYSCALLS.getStreamFromFD(e);
          switch (t2) {
            case 0: {
              var o4 = syscallGetVarargI();
              if (o4 < 0)
                return -28;
              for (;FS.streams[o4]; )
                o4++;
              var s4;
              return s4 = FS.dupStream(a2, o4), s4.fd;
            }
            case 1:
            case 2:
              return 0;
            case 3:
              return a2.flags;
            case 4: {
              var o4 = syscallGetVarargI();
              return a2.flags |= o4, 0;
            }
            case 12: {
              var o4 = syscallGetVarargP(), n3 = 0;
              return HEAP16[o4 + n3 >> 1] = 2, 0;
            }
            case 13:
            case 14:
              return 0;
          }
          return -28;
        } catch (_3) {
          if (typeof FS > "u" || _3.name !== "ErrnoError")
            throw _3;
          return -_3.errno;
        }
      }
      ___syscall_fcntl64.sig = "iiip";
      function ___syscall_fdatasync(e) {
        try {
          var t2 = SYSCALLS.getStreamFromFD(e);
          return 0;
        } catch (r) {
          if (typeof FS > "u" || r.name !== "ErrnoError")
            throw r;
          return -r.errno;
        }
      }
      ___syscall_fdatasync.sig = "ii";
      function ___syscall_fstat64(e, t2) {
        try {
          var r = SYSCALLS.getStreamFromFD(e);
          return SYSCALLS.doStat(FS.stat, r.path, t2);
        } catch (a2) {
          if (typeof FS > "u" || a2.name !== "ErrnoError")
            throw a2;
          return -a2.errno;
        }
      }
      ___syscall_fstat64.sig = "iip";
      function ___syscall_ftruncate64(e, t2) {
        t2 = bigintToI53Checked(t2);
        try {
          return isNaN(t2) ? 61 : (FS.ftruncate(e, t2), 0);
        } catch (r) {
          if (typeof FS > "u" || r.name !== "ErrnoError")
            throw r;
          return -r.errno;
        }
      }
      ___syscall_ftruncate64.sig = "iij";
      var stringToUTF8 = (e, t2, r) => stringToUTF8Array(e, HEAPU8, t2, r);
      function ___syscall_getcwd(e, t2) {
        try {
          if (t2 === 0)
            return -28;
          var r = FS.cwd(), a2 = lengthBytesUTF8(r) + 1;
          return t2 < a2 ? -68 : (stringToUTF8(r, e, t2), a2);
        } catch (o4) {
          if (typeof FS > "u" || o4.name !== "ErrnoError")
            throw o4;
          return -o4.errno;
        }
      }
      ___syscall_getcwd.sig = "ipp";
      function ___syscall_getdents64(e, t2, r) {
        try {
          var a2 = SYSCALLS.getStreamFromFD(e);
          a2.getdents || (a2.getdents = FS.readdir(a2.path));
          for (var o4 = 280, s4 = 0, n3 = FS.llseek(a2, 0, 1), _3 = Math.floor(n3 / o4), l3 = Math.min(a2.getdents.length, _3 + Math.floor(r / o4)), p4 = _3;p4 < l3; p4++) {
            var m4, d2, g5 = a2.getdents[p4];
            if (g5 === ".")
              m4 = a2.node.id, d2 = 4;
            else if (g5 === "..") {
              var u2 = FS.lookupPath(a2.path, { parent: true });
              m4 = u2.node.id, d2 = 4;
            } else {
              var f3;
              try {
                f3 = FS.lookupNode(a2.node, g5);
              } catch (c2) {
                if (c2?.errno === 28)
                  continue;
                throw c2;
              }
              m4 = f3.id, d2 = FS.isChrdev(f3.mode) ? 2 : FS.isDir(f3.mode) ? 4 : FS.isLink(f3.mode) ? 10 : 8;
            }
            HEAP64[t2 + s4 >> 3] = BigInt(m4), HEAP64[t2 + s4 + 8 >> 3] = BigInt((p4 + 1) * o4), HEAP16[t2 + s4 + 16 >> 1] = 280, HEAP8[t2 + s4 + 18] = d2, stringToUTF8(g5, t2 + s4 + 19, 256), s4 += o4;
          }
          return FS.llseek(a2, p4 * o4, 0), s4;
        } catch (c2) {
          if (typeof FS > "u" || c2.name !== "ErrnoError")
            throw c2;
          return -c2.errno;
        }
      }
      ___syscall_getdents64.sig = "iipp";
      function ___syscall_ioctl(e, t2, r) {
        SYSCALLS.varargs = r;
        try {
          var a2 = SYSCALLS.getStreamFromFD(e);
          switch (t2) {
            case 21509:
              return a2.tty ? 0 : -59;
            case 21505: {
              if (!a2.tty)
                return -59;
              if (a2.tty.ops.ioctl_tcgets) {
                var o4 = a2.tty.ops.ioctl_tcgets(a2), s4 = syscallGetVarargP();
                HEAP32[s4 >> 2] = o4.c_iflag || 0, HEAP32[s4 + 4 >> 2] = o4.c_oflag || 0, HEAP32[s4 + 8 >> 2] = o4.c_cflag || 0, HEAP32[s4 + 12 >> 2] = o4.c_lflag || 0;
                for (var n3 = 0;n3 < 32; n3++)
                  HEAP8[s4 + n3 + 17] = o4.c_cc[n3] || 0;
                return 0;
              }
              return 0;
            }
            case 21510:
            case 21511:
            case 21512:
              return a2.tty ? 0 : -59;
            case 21506:
            case 21507:
            case 21508: {
              if (!a2.tty)
                return -59;
              if (a2.tty.ops.ioctl_tcsets) {
                for (var s4 = syscallGetVarargP(), _3 = HEAP32[s4 >> 2], l3 = HEAP32[s4 + 4 >> 2], p4 = HEAP32[s4 + 8 >> 2], m4 = HEAP32[s4 + 12 >> 2], d2 = [], n3 = 0;n3 < 32; n3++)
                  d2.push(HEAP8[s4 + n3 + 17]);
                return a2.tty.ops.ioctl_tcsets(a2.tty, t2, { c_iflag: _3, c_oflag: l3, c_cflag: p4, c_lflag: m4, c_cc: d2 });
              }
              return 0;
            }
            case 21519: {
              if (!a2.tty)
                return -59;
              var s4 = syscallGetVarargP();
              return HEAP32[s4 >> 2] = 0, 0;
            }
            case 21520:
              return a2.tty ? -28 : -59;
            case 21531: {
              var s4 = syscallGetVarargP();
              return FS.ioctl(a2, t2, s4);
            }
            case 21523: {
              if (!a2.tty)
                return -59;
              if (a2.tty.ops.ioctl_tiocgwinsz) {
                var g5 = a2.tty.ops.ioctl_tiocgwinsz(a2.tty), s4 = syscallGetVarargP();
                HEAP16[s4 >> 1] = g5[0], HEAP16[s4 + 2 >> 1] = g5[1];
              }
              return 0;
            }
            case 21524:
              return a2.tty ? 0 : -59;
            case 21515:
              return a2.tty ? 0 : -59;
            default:
              return -28;
          }
        } catch (u2) {
          if (typeof FS > "u" || u2.name !== "ErrnoError")
            throw u2;
          return -u2.errno;
        }
      }
      ___syscall_ioctl.sig = "iiip";
      function ___syscall_lstat64(e, t2) {
        try {
          return e = SYSCALLS.getStr(e), SYSCALLS.doStat(FS.lstat, e, t2);
        } catch (r) {
          if (typeof FS > "u" || r.name !== "ErrnoError")
            throw r;
          return -r.errno;
        }
      }
      ___syscall_lstat64.sig = "ipp";
      function ___syscall_mkdirat(e, t2, r) {
        try {
          return t2 = SYSCALLS.getStr(t2), t2 = SYSCALLS.calculateAt(e, t2), FS.mkdir(t2, r, 0), 0;
        } catch (a2) {
          if (typeof FS > "u" || a2.name !== "ErrnoError")
            throw a2;
          return -a2.errno;
        }
      }
      ___syscall_mkdirat.sig = "iipi";
      function ___syscall_newfstatat(e, t2, r, a2) {
        try {
          t2 = SYSCALLS.getStr(t2);
          var o4 = a2 & 256, s4 = a2 & 4096;
          return a2 = a2 & -6401, t2 = SYSCALLS.calculateAt(e, t2, s4), SYSCALLS.doStat(o4 ? FS.lstat : FS.stat, t2, r);
        } catch (n3) {
          if (typeof FS > "u" || n3.name !== "ErrnoError")
            throw n3;
          return -n3.errno;
        }
      }
      ___syscall_newfstatat.sig = "iippi";
      function ___syscall_openat(e, t2, r, a2) {
        SYSCALLS.varargs = a2;
        try {
          t2 = SYSCALLS.getStr(t2), t2 = SYSCALLS.calculateAt(e, t2);
          var o4 = a2 ? syscallGetVarargI() : 0;
          return FS.open(t2, r, o4).fd;
        } catch (s4) {
          if (typeof FS > "u" || s4.name !== "ErrnoError")
            throw s4;
          return -s4.errno;
        }
      }
      ___syscall_openat.sig = "iipip";
      var PIPEFS = { BUCKET_BUFFER_SIZE: 8192, mount(e) {
        return FS.createNode(null, "/", 16895, 0);
      }, createPipe() {
        var e = { buckets: [], refcnt: 2 };
        e.buckets.push({ buffer: new Uint8Array(PIPEFS.BUCKET_BUFFER_SIZE), offset: 0, roffset: 0 });
        var t2 = PIPEFS.nextname(), r = PIPEFS.nextname(), a2 = FS.createNode(PIPEFS.root, t2, 4096, 0), o4 = FS.createNode(PIPEFS.root, r, 4096, 0);
        a2.pipe = e, o4.pipe = e;
        var s4 = FS.createStream({ path: t2, node: a2, flags: 0, seekable: false, stream_ops: PIPEFS.stream_ops });
        a2.stream = s4;
        var n3 = FS.createStream({ path: r, node: o4, flags: 1, seekable: false, stream_ops: PIPEFS.stream_ops });
        return o4.stream = n3, { readable_fd: s4.fd, writable_fd: n3.fd };
      }, stream_ops: { poll(e) {
        var t2 = e.node.pipe;
        if ((e.flags & 2097155) === 1)
          return 260;
        if (t2.buckets.length > 0)
          for (var r = 0;r < t2.buckets.length; r++) {
            var a2 = t2.buckets[r];
            if (a2.offset - a2.roffset > 0)
              return 65;
          }
        return 0;
      }, ioctl(e, t2, r) {
        return 28;
      }, fsync(e) {
        return 28;
      }, read(e, t2, r, a2, o4) {
        for (var s4 = e.node.pipe, n3 = 0, _3 = 0;_3 < s4.buckets.length; _3++) {
          var l3 = s4.buckets[_3];
          n3 += l3.offset - l3.roffset;
        }
        var p4 = t2.subarray(r, r + a2);
        if (a2 <= 0)
          return 0;
        if (n3 == 0)
          throw new FS.ErrnoError(6);
        for (var m4 = Math.min(n3, a2), d2 = m4, g5 = 0, _3 = 0;_3 < s4.buckets.length; _3++) {
          var u2 = s4.buckets[_3], f3 = u2.offset - u2.roffset;
          if (m4 <= f3) {
            var c2 = u2.buffer.subarray(u2.roffset, u2.offset);
            m4 < f3 ? (c2 = c2.subarray(0, m4), u2.roffset += m4) : g5++, p4.set(c2);
            break;
          } else {
            var c2 = u2.buffer.subarray(u2.roffset, u2.offset);
            p4.set(c2), p4 = p4.subarray(c2.byteLength), m4 -= c2.byteLength, g5++;
          }
        }
        return g5 && g5 == s4.buckets.length && (g5--, s4.buckets[g5].offset = 0, s4.buckets[g5].roffset = 0), s4.buckets.splice(0, g5), d2;
      }, write(e, t2, r, a2, o4) {
        var s4 = e.node.pipe, n3 = t2.subarray(r, r + a2), _3 = n3.byteLength;
        if (_3 <= 0)
          return 0;
        var l3 = null;
        s4.buckets.length == 0 ? (l3 = { buffer: new Uint8Array(PIPEFS.BUCKET_BUFFER_SIZE), offset: 0, roffset: 0 }, s4.buckets.push(l3)) : l3 = s4.buckets[s4.buckets.length - 1], assert(l3.offset <= PIPEFS.BUCKET_BUFFER_SIZE);
        var p4 = PIPEFS.BUCKET_BUFFER_SIZE - l3.offset;
        if (p4 >= _3)
          return l3.buffer.set(n3, l3.offset), l3.offset += _3, _3;
        p4 > 0 && (l3.buffer.set(n3.subarray(0, p4), l3.offset), l3.offset += p4, n3 = n3.subarray(p4, n3.byteLength));
        for (var m4 = n3.byteLength / PIPEFS.BUCKET_BUFFER_SIZE | 0, d2 = n3.byteLength % PIPEFS.BUCKET_BUFFER_SIZE, g5 = 0;g5 < m4; g5++) {
          var u2 = { buffer: new Uint8Array(PIPEFS.BUCKET_BUFFER_SIZE), offset: PIPEFS.BUCKET_BUFFER_SIZE, roffset: 0 };
          s4.buckets.push(u2), u2.buffer.set(n3.subarray(0, PIPEFS.BUCKET_BUFFER_SIZE)), n3 = n3.subarray(PIPEFS.BUCKET_BUFFER_SIZE, n3.byteLength);
        }
        if (d2 > 0) {
          var u2 = { buffer: new Uint8Array(PIPEFS.BUCKET_BUFFER_SIZE), offset: n3.byteLength, roffset: 0 };
          s4.buckets.push(u2), u2.buffer.set(n3);
        }
        return _3;
      }, close(e) {
        var t2 = e.node.pipe;
        t2.refcnt--, t2.refcnt === 0 && (t2.buckets = null);
      } }, nextname() {
        return PIPEFS.nextname.current || (PIPEFS.nextname.current = 0), "pipe[" + PIPEFS.nextname.current++ + "]";
      } };
      function ___syscall_pipe(e) {
        try {
          if (e == 0)
            throw new FS.ErrnoError(21);
          var t2 = PIPEFS.createPipe();
          return HEAP32[e >> 2] = t2.readable_fd, HEAP32[e + 4 >> 2] = t2.writable_fd, 0;
        } catch (r) {
          if (typeof FS > "u" || r.name !== "ErrnoError")
            throw r;
          return -r.errno;
        }
      }
      ___syscall_pipe.sig = "ip";
      function ___syscall_readlinkat(e, t2, r, a2) {
        try {
          if (t2 = SYSCALLS.getStr(t2), t2 = SYSCALLS.calculateAt(e, t2), a2 <= 0)
            return -28;
          var o4 = FS.readlink(t2), s4 = Math.min(a2, lengthBytesUTF8(o4)), n3 = HEAP8[r + s4];
          return stringToUTF8(o4, r, a2 + 1), HEAP8[r + s4] = n3, s4;
        } catch (_3) {
          if (typeof FS > "u" || _3.name !== "ErrnoError")
            throw _3;
          return -_3.errno;
        }
      }
      ___syscall_readlinkat.sig = "iippp";
      var writeSockaddr = (e, t2, r, a2, o4) => {
        switch (t2) {
          case 2:
            r = inetPton4(r), zeroMemory(e, 16), o4 && (HEAP32[o4 >> 2] = 16), HEAP16[e >> 1] = t2, HEAP32[e + 4 >> 2] = r, HEAP16[e + 2 >> 1] = _htons(a2);
            break;
          case 10:
            r = inetPton6(r), zeroMemory(e, 28), o4 && (HEAP32[o4 >> 2] = 28), HEAP32[e >> 2] = t2, HEAP32[e + 8 >> 2] = r[0], HEAP32[e + 12 >> 2] = r[1], HEAP32[e + 16 >> 2] = r[2], HEAP32[e + 20 >> 2] = r[3], HEAP16[e + 2 >> 1] = _htons(a2);
            break;
          default:
            return 5;
        }
        return 0;
      };
      function ___syscall_recvfrom(e, t2, r, a2, o4, s4) {
        try {
          var n3 = getSocketFromFD(e), _3 = n3.sock_ops.recvmsg(n3, r);
          if (!_3)
            return 0;
          if (o4)
            var l3 = writeSockaddr(o4, n3.family, DNS.lookup_name(_3.addr), _3.port, s4);
          return HEAPU8.set(_3.buffer, t2), _3.buffer.byteLength;
        } catch (p4) {
          if (typeof FS > "u" || p4.name !== "ErrnoError")
            throw p4;
          return -p4.errno;
        }
      }
      ___syscall_recvfrom.sig = "iippipp";
      function ___syscall_renameat(e, t2, r, a2) {
        try {
          return t2 = SYSCALLS.getStr(t2), a2 = SYSCALLS.getStr(a2), t2 = SYSCALLS.calculateAt(e, t2), a2 = SYSCALLS.calculateAt(r, a2), FS.rename(t2, a2), 0;
        } catch (o4) {
          if (typeof FS > "u" || o4.name !== "ErrnoError")
            throw o4;
          return -o4.errno;
        }
      }
      ___syscall_renameat.sig = "iipip";
      function ___syscall_rmdir(e) {
        try {
          return e = SYSCALLS.getStr(e), FS.rmdir(e), 0;
        } catch (t2) {
          if (typeof FS > "u" || t2.name !== "ErrnoError")
            throw t2;
          return -t2.errno;
        }
      }
      ___syscall_rmdir.sig = "ip";
      function ___syscall_sendto(e, t2, r, a2, o4, s4) {
        try {
          var n3 = getSocketFromFD(e);
          if (!o4)
            return FS.write(n3.stream, HEAP8, t2, r);
          var _3 = getSocketAddress(o4, s4);
          return n3.sock_ops.sendmsg(n3, HEAP8, t2, r, _3.addr, _3.port);
        } catch (l3) {
          if (typeof FS > "u" || l3.name !== "ErrnoError")
            throw l3;
          return -l3.errno;
        }
      }
      ___syscall_sendto.sig = "iippipp";
      function ___syscall_socket(e, t2, r) {
        try {
          var a2 = SOCKFS.createSocket(e, t2, r);
          return a2.stream.fd;
        } catch (o4) {
          if (typeof FS > "u" || o4.name !== "ErrnoError")
            throw o4;
          return -o4.errno;
        }
      }
      ___syscall_socket.sig = "iiiiiii";
      function ___syscall_stat64(e, t2) {
        try {
          return e = SYSCALLS.getStr(e), SYSCALLS.doStat(FS.stat, e, t2);
        } catch (r) {
          if (typeof FS > "u" || r.name !== "ErrnoError")
            throw r;
          return -r.errno;
        }
      }
      ___syscall_stat64.sig = "ipp";
      function ___syscall_symlinkat(e, t2, r) {
        try {
          return e = SYSCALLS.getStr(e), r = SYSCALLS.getStr(r), r = SYSCALLS.calculateAt(t2, r), FS.symlink(e, r), 0;
        } catch (a2) {
          if (typeof FS > "u" || a2.name !== "ErrnoError")
            throw a2;
          return -a2.errno;
        }
      }
      ___syscall_symlinkat.sig = "ipip";
      function ___syscall_truncate64(e, t2) {
        t2 = bigintToI53Checked(t2);
        try {
          return isNaN(t2) ? 61 : (e = SYSCALLS.getStr(e), FS.truncate(e, t2), 0);
        } catch (r) {
          if (typeof FS > "u" || r.name !== "ErrnoError")
            throw r;
          return -r.errno;
        }
      }
      ___syscall_truncate64.sig = "ipj";
      function ___syscall_unlinkat(e, t2, r) {
        try {
          return t2 = SYSCALLS.getStr(t2), t2 = SYSCALLS.calculateAt(e, t2), r === 0 ? FS.unlink(t2) : r === 512 ? FS.rmdir(t2) : abort("Invalid flags passed to unlinkat"), 0;
        } catch (a2) {
          if (typeof FS > "u" || a2.name !== "ErrnoError")
            throw a2;
          return -a2.errno;
        }
      }
      ___syscall_unlinkat.sig = "iipi";
      var ___table_base = new WebAssembly.Global({ value: "i32", mutable: false }, 1);
      Module.___table_base = ___table_base;
      var __abort_js = () => abort("");
      __abort_js.sig = "v";
      var ENV = {}, stackAlloc = (e) => __emscripten_stack_alloc(e), stringToUTF8OnStack = (e) => {
        var t2 = lengthBytesUTF8(e) + 1, r = stackAlloc(t2);
        return stringToUTF8(e, r, t2), r;
      }, dlSetError = (e) => {
        var t2 = stackSave(), r = stringToUTF8OnStack(e);
        ___dl_seterr(r, 0), stackRestore(t2);
      }, dlopenInternal = (e, t2) => {
        var r = UTF8ToString(e + 36), a2 = HEAP32[e + 4 >> 2];
        r = PATH.normalize(r);
        var o4 = !!(a2 & 256), s4 = o4 ? null : {}, n3 = { global: o4, nodelete: !!(a2 & 4096), loadAsync: t2.loadAsync };
        if (t2.loadAsync)
          return loadDynamicLibrary(r, n3, s4, e);
        try {
          return loadDynamicLibrary(r, n3, s4, e);
        } catch (_3) {
          return dlSetError(`Could not load dynamic lib: ${r}
${_3}`), 0;
        }
      }, __dlopen_js = (e) => dlopenInternal(e, { loadAsync: false });
      __dlopen_js.sig = "pp";
      var __dlsym_js = (e, t2, r) => {
        t2 = UTF8ToString(t2);
        var a2, o4, s4 = LDSO.loadedLibsByHandle[e];
        if (!s4.exports.hasOwnProperty(t2) || s4.exports[t2].stub)
          return dlSetError(`Tried to lookup unknown symbol "${t2}" in dynamic lib: ${s4.name}`), 0;
        if (o4 = Object.keys(s4.exports).indexOf(t2), a2 = s4.exports[t2], typeof a2 == "function") {
          var n3 = getFunctionAddress(a2);
          n3 ? a2 = n3 : (a2 = addFunction(a2, a2.sig), HEAPU32[r >> 2] = o4);
        }
        return a2;
      };
      __dlsym_js.sig = "pppp";
      var __emscripten_memcpy_js = (e, t2, r) => HEAPU8.copyWithin(e, t2, t2 + r);
      __emscripten_memcpy_js.sig = "vppp";
      var runtimeKeepaliveCounter = 0, __emscripten_runtime_keepalive_clear = () => {
        noExitRuntime = false, runtimeKeepaliveCounter = 0;
      };
      __emscripten_runtime_keepalive_clear.sig = "v";
      var __emscripten_system = (e) => {
        if (ENVIRONMENT_IS_NODE) {
          if (!e)
            return 1;
          var t2 = UTF8ToString(e);
          if (!t2.length)
            return 0;
          var r = require("child_process"), a2 = r.spawnSync(t2, [], { shell: true, stdio: "inherit" }), o4 = (n3, _3) => n3 << 8 | _3;
          if (a2.status === null) {
            var s4 = (n3) => {
              switch (n3) {
                case "SIGHUP":
                  return 1;
                case "SIGQUIT":
                  return 3;
                case "SIGFPE":
                  return 8;
                case "SIGKILL":
                  return 9;
                case "SIGALRM":
                  return 14;
                case "SIGTERM":
                  return 15;
                default:
                  return 2;
              }
            };
            return o4(0, s4(a2.signal));
          }
          return o4(a2.status, 0);
        }
        return e ? -52 : 0;
      };
      __emscripten_system.sig = "ip";
      var __emscripten_throw_longjmp = () => {
        throw Infinity;
      };
      __emscripten_throw_longjmp.sig = "v";
      function __gmtime_js(e, t2) {
        e = bigintToI53Checked(e);
        var r = new Date(e * 1000);
        HEAP32[t2 >> 2] = r.getUTCSeconds(), HEAP32[t2 + 4 >> 2] = r.getUTCMinutes(), HEAP32[t2 + 8 >> 2] = r.getUTCHours(), HEAP32[t2 + 12 >> 2] = r.getUTCDate(), HEAP32[t2 + 16 >> 2] = r.getUTCMonth(), HEAP32[t2 + 20 >> 2] = r.getUTCFullYear() - 1900, HEAP32[t2 + 24 >> 2] = r.getUTCDay();
        var a2 = Date.UTC(r.getUTCFullYear(), 0, 1, 0, 0, 0, 0), o4 = (r.getTime() - a2) / 86400000 | 0;
        HEAP32[t2 + 28 >> 2] = o4;
      }
      __gmtime_js.sig = "vjp";
      var isLeapYear = (e) => e % 4 === 0 && (e % 100 !== 0 || e % 400 === 0), MONTH_DAYS_LEAP_CUMULATIVE = [0, 31, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335], MONTH_DAYS_REGULAR_CUMULATIVE = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334], ydayFromDate = (e) => {
        var t2 = isLeapYear(e.getFullYear()), r = t2 ? MONTH_DAYS_LEAP_CUMULATIVE : MONTH_DAYS_REGULAR_CUMULATIVE, a2 = r[e.getMonth()] + e.getDate() - 1;
        return a2;
      };
      function __localtime_js(e, t2) {
        e = bigintToI53Checked(e);
        var r = new Date(e * 1000);
        HEAP32[t2 >> 2] = r.getSeconds(), HEAP32[t2 + 4 >> 2] = r.getMinutes(), HEAP32[t2 + 8 >> 2] = r.getHours(), HEAP32[t2 + 12 >> 2] = r.getDate(), HEAP32[t2 + 16 >> 2] = r.getMonth(), HEAP32[t2 + 20 >> 2] = r.getFullYear() - 1900, HEAP32[t2 + 24 >> 2] = r.getDay();
        var a2 = ydayFromDate(r) | 0;
        HEAP32[t2 + 28 >> 2] = a2, HEAP32[t2 + 36 >> 2] = -(r.getTimezoneOffset() * 60);
        var o4 = new Date(r.getFullYear(), 0, 1), s4 = new Date(r.getFullYear(), 6, 1).getTimezoneOffset(), n3 = o4.getTimezoneOffset(), _3 = (s4 != n3 && r.getTimezoneOffset() == Math.min(n3, s4)) | 0;
        HEAP32[t2 + 32 >> 2] = _3;
      }
      __localtime_js.sig = "vjp";
      function __mmap_js(e, t2, r, a2, o4, s4, n3) {
        o4 = bigintToI53Checked(o4);
        try {
          if (isNaN(o4))
            return 61;
          var _3 = SYSCALLS.getStreamFromFD(a2), l3 = FS.mmap(_3, e, o4, t2, r), p4 = l3.ptr;
          return HEAP32[s4 >> 2] = l3.allocated, HEAPU32[n3 >> 2] = p4, 0;
        } catch (m4) {
          if (typeof FS > "u" || m4.name !== "ErrnoError")
            throw m4;
          return -m4.errno;
        }
      }
      __mmap_js.sig = "ipiiijpp";
      function __munmap_js(e, t2, r, a2, o4, s4) {
        s4 = bigintToI53Checked(s4);
        try {
          var n3 = SYSCALLS.getStreamFromFD(o4);
          r & 2 && SYSCALLS.doMsync(e, n3, t2, a2, s4);
        } catch (_3) {
          if (typeof FS > "u" || _3.name !== "ErrnoError")
            throw _3;
          return -_3.errno;
        }
      }
      __munmap_js.sig = "ippiiij";
      var timers = {}, handleException = (e) => {
        if (e instanceof ExitStatus || e == "unwind")
          return EXITSTATUS;
        quit_(1, e);
      }, keepRuntimeAlive = () => noExitRuntime || runtimeKeepaliveCounter > 0, _proc_exit = (e) => {
        EXITSTATUS = e, keepRuntimeAlive() || (Module.onExit?.(e), ABORT = true), quit_(e, new ExitStatus(e));
      };
      _proc_exit.sig = "vi";
      var exitJS = (e, t2) => {
        EXITSTATUS = e, _proc_exit(e);
      }, _exit = exitJS;
      _exit.sig = "vi";
      var maybeExit = () => {
        if (!keepRuntimeAlive())
          try {
            _exit(EXITSTATUS);
          } catch (e) {
            handleException(e);
          }
      }, callUserCallback = (e) => {
        if (!ABORT)
          try {
            e(), maybeExit();
          } catch (t2) {
            handleException(t2);
          }
      }, _emscripten_get_now = () => performance.now();
      _emscripten_get_now.sig = "d";
      var __setitimer_js = (e, t2) => {
        if (timers[e] && (clearTimeout(timers[e].id), delete timers[e]), !t2)
          return 0;
        var r = setTimeout(() => {
          delete timers[e], callUserCallback(() => __emscripten_timeout(e, _emscripten_get_now()));
        }, t2);
        return timers[e] = { id: r, timeout_ms: t2 }, 0;
      };
      __setitimer_js.sig = "iid";
      var __tzset_js = (e, t2, r, a2) => {
        var o4 = new Date().getFullYear(), s4 = new Date(o4, 0, 1), n3 = new Date(o4, 6, 1), _3 = s4.getTimezoneOffset(), l3 = n3.getTimezoneOffset(), p4 = Math.max(_3, l3);
        HEAPU32[e >> 2] = p4 * 60, HEAP32[t2 >> 2] = +(_3 != l3);
        var m4 = (u2) => {
          var f3 = u2 >= 0 ? "-" : "+", c2 = Math.abs(u2), w4 = String(Math.floor(c2 / 60)).padStart(2, "0"), x6 = String(c2 % 60).padStart(2, "0");
          return `UTC${f3}${w4}${x6}`;
        }, d2 = m4(_3), g5 = m4(l3);
        l3 < _3 ? (stringToUTF8(d2, r, 17), stringToUTF8(g5, a2, 17)) : (stringToUTF8(d2, a2, 17), stringToUTF8(g5, r, 17));
      };
      __tzset_js.sig = "vpppp";
      var _emscripten_date_now = () => Date.now();
      _emscripten_date_now.sig = "d";
      var nowIsMonotonic = 1, checkWasiClock = (e) => e >= 0 && e <= 3;
      function _clock_time_get(e, t2, r) {
        if (t2 = bigintToI53Checked(t2), !checkWasiClock(e))
          return 28;
        var a2;
        if (e === 0)
          a2 = _emscripten_date_now();
        else if (nowIsMonotonic)
          a2 = _emscripten_get_now();
        else
          return 52;
        var o4 = Math.round(a2 * 1000 * 1000);
        return HEAP64[r >> 3] = BigInt(o4), 0;
      }
      _clock_time_get.sig = "iijp";
      var readEmAsmArgsArray = [], readEmAsmArgs = (e, t2) => {
        readEmAsmArgsArray.length = 0;
        for (var r;r = HEAPU8[e++]; ) {
          var a2 = r != 105;
          a2 &= r != 112, t2 += a2 && t2 % 8 ? 4 : 0, readEmAsmArgsArray.push(r == 112 ? HEAPU32[t2 >> 2] : r == 106 ? HEAP64[t2 >> 3] : r == 105 ? HEAP32[t2 >> 2] : HEAPF64[t2 >> 3]), t2 += a2 ? 8 : 4;
        }
        return readEmAsmArgsArray;
      }, runEmAsmFunction = (e, t2, r) => {
        var a2 = readEmAsmArgs(t2, r);
        return ASM_CONSTS[e](...a2);
      }, _emscripten_asm_const_int = (e, t2, r) => runEmAsmFunction(e, t2, r);
      _emscripten_asm_const_int.sig = "ippp";
      var _emscripten_force_exit = (e) => {
        __emscripten_runtime_keepalive_clear(), _exit(e);
      };
      _emscripten_force_exit.sig = "vi";
      var getHeapMax = () => 2147483648, growMemory = (e) => {
        var t2 = wasmMemory.buffer, r = (e - t2.byteLength + 65535) / 65536 | 0;
        try {
          return wasmMemory.grow(r), updateMemoryViews(), 1;
        } catch {}
      }, _emscripten_resize_heap = (e) => {
        var t2 = HEAPU8.length;
        e >>>= 0;
        var r = getHeapMax();
        if (e > r)
          return false;
        for (var a2 = 1;a2 <= 4; a2 *= 2) {
          var o4 = t2 * (1 + 0.2 / a2);
          o4 = Math.min(o4, e + 100663296);
          var s4 = Math.min(r, alignMemory(Math.max(e, o4), 65536)), n3 = growMemory(s4);
          if (n3)
            return true;
        }
        return false;
      };
      _emscripten_resize_heap.sig = "ip";
      var getExecutableName = () => thisProgram || "./this.program", getEnvStrings = () => {
        if (!getEnvStrings.strings) {
          var e = (typeof navigator == "object" && navigator.languages && navigator.languages[0] || "C").replace("-", "_") + ".UTF-8", t2 = { USER: "web_user", LOGNAME: "web_user", PATH: "/", PWD: "/", HOME: "/home/web_user", LANG: e, _: getExecutableName() };
          for (var r in ENV)
            ENV[r] === undefined ? delete t2[r] : t2[r] = ENV[r];
          var a2 = [];
          for (var r in t2)
            a2.push(`${r}=${t2[r]}`);
          getEnvStrings.strings = a2;
        }
        return getEnvStrings.strings;
      }, stringToAscii = (e, t2) => {
        for (var r = 0;r < e.length; ++r)
          HEAP8[t2++] = e.charCodeAt(r);
        HEAP8[t2] = 0;
      }, _environ_get = (e, t2) => {
        var r = 0;
        return getEnvStrings().forEach((a2, o4) => {
          var s4 = t2 + r;
          HEAPU32[e + o4 * 4 >> 2] = s4, stringToAscii(a2, s4), r += a2.length + 1;
        }), 0;
      };
      _environ_get.sig = "ipp";
      var _environ_sizes_get = (e, t2) => {
        var r = getEnvStrings();
        HEAPU32[e >> 2] = r.length;
        var a2 = 0;
        return r.forEach((o4) => a2 += o4.length + 1), HEAPU32[t2 >> 2] = a2, 0;
      };
      _environ_sizes_get.sig = "ipp";
      function _fd_close(e) {
        try {
          var t2 = SYSCALLS.getStreamFromFD(e);
          return FS.close(t2), 0;
        } catch (r) {
          if (typeof FS > "u" || r.name !== "ErrnoError")
            throw r;
          return r.errno;
        }
      }
      _fd_close.sig = "ii";
      function _fd_fdstat_get(e, t2) {
        try {
          var r = 0, a2 = 0, o4 = 0, s4 = SYSCALLS.getStreamFromFD(e), n3 = s4.tty ? 2 : FS.isDir(s4.mode) ? 3 : FS.isLink(s4.mode) ? 7 : 4;
          return HEAP8[t2] = n3, HEAP16[t2 + 2 >> 1] = o4, HEAP64[t2 + 8 >> 3] = BigInt(r), HEAP64[t2 + 16 >> 3] = BigInt(a2), 0;
        } catch (_3) {
          if (typeof FS > "u" || _3.name !== "ErrnoError")
            throw _3;
          return _3.errno;
        }
      }
      _fd_fdstat_get.sig = "iip";
      var doReadv = (e, t2, r, a2) => {
        for (var o4 = 0, s4 = 0;s4 < r; s4++) {
          var n3 = HEAPU32[t2 >> 2], _3 = HEAPU32[t2 + 4 >> 2];
          t2 += 8;
          var l3 = FS.read(e, HEAP8, n3, _3, a2);
          if (l3 < 0)
            return -1;
          if (o4 += l3, l3 < _3)
            break;
          typeof a2 < "u" && (a2 += l3);
        }
        return o4;
      };
      function _fd_pread(e, t2, r, a2, o4) {
        a2 = bigintToI53Checked(a2);
        try {
          if (isNaN(a2))
            return 61;
          var s4 = SYSCALLS.getStreamFromFD(e), n3 = doReadv(s4, t2, r, a2);
          return HEAPU32[o4 >> 2] = n3, 0;
        } catch (_3) {
          if (typeof FS > "u" || _3.name !== "ErrnoError")
            throw _3;
          return _3.errno;
        }
      }
      _fd_pread.sig = "iippjp";
      var doWritev = (e, t2, r, a2) => {
        for (var o4 = 0, s4 = 0;s4 < r; s4++) {
          var n3 = HEAPU32[t2 >> 2], _3 = HEAPU32[t2 + 4 >> 2];
          t2 += 8;
          var l3 = FS.write(e, HEAP8, n3, _3, a2);
          if (l3 < 0)
            return -1;
          if (o4 += l3, l3 < _3)
            break;
          typeof a2 < "u" && (a2 += l3);
        }
        return o4;
      };
      function _fd_pwrite(e, t2, r, a2, o4) {
        a2 = bigintToI53Checked(a2);
        try {
          if (isNaN(a2))
            return 61;
          var s4 = SYSCALLS.getStreamFromFD(e), n3 = doWritev(s4, t2, r, a2);
          return HEAPU32[o4 >> 2] = n3, 0;
        } catch (_3) {
          if (typeof FS > "u" || _3.name !== "ErrnoError")
            throw _3;
          return _3.errno;
        }
      }
      _fd_pwrite.sig = "iippjp";
      function _fd_read(e, t2, r, a2) {
        try {
          var o4 = SYSCALLS.getStreamFromFD(e), s4 = doReadv(o4, t2, r);
          return HEAPU32[a2 >> 2] = s4, 0;
        } catch (n3) {
          if (typeof FS > "u" || n3.name !== "ErrnoError")
            throw n3;
          return n3.errno;
        }
      }
      _fd_read.sig = "iippp";
      function _fd_seek(e, t2, r, a2) {
        t2 = bigintToI53Checked(t2);
        try {
          if (isNaN(t2))
            return 61;
          var o4 = SYSCALLS.getStreamFromFD(e);
          return FS.llseek(o4, t2, r), HEAP64[a2 >> 3] = BigInt(o4.position), o4.getdents && t2 === 0 && r === 0 && (o4.getdents = null), 0;
        } catch (s4) {
          if (typeof FS > "u" || s4.name !== "ErrnoError")
            throw s4;
          return s4.errno;
        }
      }
      _fd_seek.sig = "iijip";
      function _fd_sync(e) {
        try {
          var t2 = SYSCALLS.getStreamFromFD(e);
          return t2.stream_ops?.fsync ? t2.stream_ops.fsync(t2) : 0;
        } catch (r) {
          if (typeof FS > "u" || r.name !== "ErrnoError")
            throw r;
          return r.errno;
        }
      }
      _fd_sync.sig = "ii";
      function _fd_write(e, t2, r, a2) {
        try {
          var o4 = SYSCALLS.getStreamFromFD(e), s4 = doWritev(o4, t2, r);
          return HEAPU32[a2 >> 2] = s4, 0;
        } catch (n3) {
          if (typeof FS > "u" || n3.name !== "ErrnoError")
            throw n3;
          return n3.errno;
        }
      }
      _fd_write.sig = "iippp";
      var _getaddrinfo = (e, t2, r, a2) => {
        var o4 = 0, s4 = 0, n3 = 0, _3 = 0, l3 = 0, p4 = 0, m4;
        function d2(g5, u2, f3, c2, w4, x6) {
          var S3, v3, b3, M2;
          return v3 = g5 === 10 ? 28 : 16, w4 = g5 === 10 ? inetNtop6(w4) : inetNtop4(w4), S3 = _malloc(v3), M2 = writeSockaddr(S3, g5, w4, x6), assert(!M2), b3 = _malloc(32), HEAP32[b3 + 4 >> 2] = g5, HEAP32[b3 + 8 >> 2] = u2, HEAP32[b3 + 12 >> 2] = f3, HEAPU32[b3 + 24 >> 2] = c2, HEAPU32[b3 + 20 >> 2] = S3, g5 === 10 ? HEAP32[b3 + 16 >> 2] = 28 : HEAP32[b3 + 16 >> 2] = 16, HEAP32[b3 + 28 >> 2] = 0, b3;
        }
        if (r && (n3 = HEAP32[r >> 2], _3 = HEAP32[r + 4 >> 2], l3 = HEAP32[r + 8 >> 2], p4 = HEAP32[r + 12 >> 2]), l3 && !p4 && (p4 = l3 === 2 ? 17 : 6), !l3 && p4 && (l3 = p4 === 17 ? 2 : 1), p4 === 0 && (p4 = 6), l3 === 0 && (l3 = 1), !e && !t2)
          return -2;
        if (n3 & -1088 || r !== 0 && HEAP32[r >> 2] & 2 && !e)
          return -1;
        if (n3 & 32)
          return -2;
        if (l3 !== 0 && l3 !== 1 && l3 !== 2)
          return -7;
        if (_3 !== 0 && _3 !== 2 && _3 !== 10)
          return -6;
        if (t2 && (t2 = UTF8ToString(t2), s4 = parseInt(t2, 10), isNaN(s4)))
          return n3 & 1024 ? -2 : -8;
        if (!e)
          return _3 === 0 && (_3 = 2), n3 & 1 || (_3 === 2 ? o4 = _htonl(2130706433) : o4 = [0, 0, 0, _htonl(1)]), m4 = d2(_3, l3, p4, null, o4, s4), HEAPU32[a2 >> 2] = m4, 0;
        if (e = UTF8ToString(e), o4 = inetPton4(e), o4 !== null)
          if (_3 === 0 || _3 === 2)
            _3 = 2;
          else if (_3 === 10 && n3 & 8)
            o4 = [0, 0, _htonl(65535), o4], _3 = 10;
          else
            return -2;
        else if (o4 = inetPton6(e), o4 !== null)
          if (_3 === 0 || _3 === 10)
            _3 = 10;
          else
            return -2;
        return o4 != null ? (m4 = d2(_3, l3, p4, e, o4, s4), HEAPU32[a2 >> 2] = m4, 0) : n3 & 4 ? -2 : (e = DNS.lookup_name(e), o4 = inetPton4(e), _3 === 0 ? _3 = 2 : _3 === 10 && (o4 = [0, 0, _htonl(65535), o4]), m4 = d2(_3, l3, p4, null, o4, s4), HEAPU32[a2 >> 2] = m4, 0);
      };
      _getaddrinfo.sig = "ipppp";
      var _getnameinfo = (e, t2, r, a2, o4, s4, n3) => {
        var _3 = readSockaddr(e, t2);
        if (_3.errno)
          return -6;
        var { port: l3, addr: p4 } = _3, m4 = false;
        if (r && a2) {
          var d2;
          if (n3 & 1 || !(d2 = DNS.lookup_addr(p4))) {
            if (n3 & 8)
              return -2;
          } else
            p4 = d2;
          var g5 = stringToUTF8(p4, r, a2);
          g5 + 1 >= a2 && (m4 = true);
        }
        if (o4 && s4) {
          l3 = "" + l3;
          var g5 = stringToUTF8(l3, o4, s4);
          g5 + 1 >= s4 && (m4 = true);
        }
        return m4 ? -12 : 0;
      };
      _getnameinfo.sig = "ipipipii";
      var stringToNewUTF8 = (e) => {
        var t2 = lengthBytesUTF8(e) + 1, r = _malloc(t2);
        return r && stringToUTF8(e, r, t2), r;
      }, removeFunction = (e) => {
        functionsInTableMap.delete(getWasmTableEntry(e)), setWasmTableEntry(e, null), freeTableIndexes.push(e);
      }, FS_createPath = FS.createPath, FS_unlink = (e) => FS.unlink(e), FS_createLazyFile = FS.createLazyFile, FS_createDevice = FS.createDevice, setTempRet0 = (e) => __emscripten_tempret_set(e), _setTempRet0 = setTempRet0;
      Module._setTempRet0 = _setTempRet0;
      var getTempRet0 = (e) => __emscripten_tempret_get(), _getTempRet0 = getTempRet0;
      Module._getTempRet0 = _getTempRet0, registerWasmPlugin(), FS.createPreloadedFile = FS_createPreloadedFile, FS.staticInit(), Module.FS_createPath = FS.createPath, Module.FS_createDataFile = FS.createDataFile, Module.FS_createPreloadedFile = FS.createPreloadedFile, Module.FS_unlink = FS.unlink, Module.FS_createLazyFile = FS.createLazyFile, Module.FS_createDevice = FS.createDevice, MEMFS.doesNotExistError = new FS.ErrnoError(44), MEMFS.doesNotExistError.stack = "<generic error, no stack>", ENVIRONMENT_IS_NODE && NODEFS.staticInit();
      var wasmImports = { __assert_fail: ___assert_fail, __call_sighandler: ___call_sighandler, __heap_base: ___heap_base, __indirect_function_table: wasmTable, __memory_base: ___memory_base, __stack_pointer: ___stack_pointer, __syscall__newselect: ___syscall__newselect, __syscall_bind: ___syscall_bind, __syscall_chdir: ___syscall_chdir, __syscall_chmod: ___syscall_chmod, __syscall_dup: ___syscall_dup, __syscall_dup3: ___syscall_dup3, __syscall_faccessat: ___syscall_faccessat, __syscall_fadvise64: ___syscall_fadvise64, __syscall_fallocate: ___syscall_fallocate, __syscall_fcntl64: ___syscall_fcntl64, __syscall_fdatasync: ___syscall_fdatasync, __syscall_fstat64: ___syscall_fstat64, __syscall_ftruncate64: ___syscall_ftruncate64, __syscall_getcwd: ___syscall_getcwd, __syscall_getdents64: ___syscall_getdents64, __syscall_ioctl: ___syscall_ioctl, __syscall_lstat64: ___syscall_lstat64, __syscall_mkdirat: ___syscall_mkdirat, __syscall_newfstatat: ___syscall_newfstatat, __syscall_openat: ___syscall_openat, __syscall_pipe: ___syscall_pipe, __syscall_readlinkat: ___syscall_readlinkat, __syscall_recvfrom: ___syscall_recvfrom, __syscall_renameat: ___syscall_renameat, __syscall_rmdir: ___syscall_rmdir, __syscall_sendto: ___syscall_sendto, __syscall_socket: ___syscall_socket, __syscall_stat64: ___syscall_stat64, __syscall_symlinkat: ___syscall_symlinkat, __syscall_truncate64: ___syscall_truncate64, __syscall_unlinkat: ___syscall_unlinkat, __table_base: ___table_base, _abort_js: __abort_js, _dlopen_js: __dlopen_js, _dlsym_js: __dlsym_js, _emscripten_memcpy_js: __emscripten_memcpy_js, _emscripten_runtime_keepalive_clear: __emscripten_runtime_keepalive_clear, _emscripten_system: __emscripten_system, _emscripten_throw_longjmp: __emscripten_throw_longjmp, _gmtime_js: __gmtime_js, _localtime_js: __localtime_js, _mmap_js: __mmap_js, _munmap_js: __munmap_js, _setitimer_js: __setitimer_js, _tzset_js: __tzset_js, clock_time_get: _clock_time_get, emscripten_asm_const_int: _emscripten_asm_const_int, emscripten_date_now: _emscripten_date_now, emscripten_force_exit: _emscripten_force_exit, emscripten_get_now: _emscripten_get_now, emscripten_resize_heap: _emscripten_resize_heap, environ_get: _environ_get, environ_sizes_get: _environ_sizes_get, exit: _exit, fd_close: _fd_close, fd_fdstat_get: _fd_fdstat_get, fd_pread: _fd_pread, fd_pwrite: _fd_pwrite, fd_read: _fd_read, fd_seek: _fd_seek, fd_sync: _fd_sync, fd_write: _fd_write, getTempRet0: _getTempRet0, getaddrinfo: _getaddrinfo, getnameinfo: _getnameinfo, invoke_di, invoke_i, invoke_id, invoke_ii, invoke_iii, invoke_iiii, invoke_iiiii, invoke_iiiiii, invoke_iiiiiii, invoke_iiiiiiii, invoke_iiiiiiiii, invoke_iiiiiiiiii, invoke_iiiiiiiiiii, invoke_iiiiiiiiiiiiii, invoke_iiiiiiiiiiiiiiiiii, invoke_iiiiiji, invoke_iiiij, invoke_iiiijii, invoke_iiij, invoke_iiji, invoke_ij, invoke_ijiiiii, invoke_ijiiiiii, invoke_j, invoke_ji, invoke_jii, invoke_jiiii, invoke_jiiiiii, invoke_jiiiiiiiii, invoke_v, invoke_vi, invoke_vid, invoke_vii, invoke_viii, invoke_viiii, invoke_viiiii, invoke_viiiiii, invoke_viiiiiii, invoke_viiiiiiii, invoke_viiiiiiiii, invoke_viiiiiiiiiiii, invoke_viiiji, invoke_viij, invoke_viiji, invoke_viijii, invoke_viijiiii, invoke_vij, invoke_viji, invoke_vijiji, invoke_vj, invoke_vji, memory: wasmMemory, proc_exit: _proc_exit, setTempRet0: _setTempRet0 }, wasmExports;
      createWasm();
      var ___wasm_call_ctors = () => (___wasm_call_ctors = wasmExports.__wasm_call_ctors)(), _fopen = Module._fopen = (e, t2) => (_fopen = Module._fopen = wasmExports.fopen)(e, t2), _fflush = Module._fflush = (e) => (_fflush = Module._fflush = wasmExports.fflush)(e), ___errno_location = Module.___errno_location = () => (___errno_location = Module.___errno_location = wasmExports.__errno_location)(), _ProcessInterrupts = Module._ProcessInterrupts = () => (_ProcessInterrupts = Module._ProcessInterrupts = wasmExports.ProcessInterrupts)(), _errstart_cold = Module._errstart_cold = (e, t2) => (_errstart_cold = Module._errstart_cold = wasmExports.errstart_cold)(e, t2), _errcode = Module._errcode = (e) => (_errcode = Module._errcode = wasmExports.errcode)(e), _errmsg = Module._errmsg = (e, t2) => (_errmsg = Module._errmsg = wasmExports.errmsg)(e, t2), _errfinish = Module._errfinish = (e, t2, r) => (_errfinish = Module._errfinish = wasmExports.errfinish)(e, t2, r), _puts = Module._puts = (e) => (_puts = Module._puts = wasmExports.puts)(e), _errstart = Module._errstart = (e, t2) => (_errstart = Module._errstart = wasmExports.errstart)(e, t2), _errmsg_internal = Module._errmsg_internal = (e, t2) => (_errmsg_internal = Module._errmsg_internal = wasmExports.errmsg_internal)(e, t2), _errdetail = Module._errdetail = (e, t2) => (_errdetail = Module._errdetail = wasmExports.errdetail)(e, t2), _errhint = Module._errhint = (e, t2) => (_errhint = Module._errhint = wasmExports.errhint)(e, t2), _pg_parse_query = Module._pg_parse_query = (e) => (_pg_parse_query = Module._pg_parse_query = wasmExports.pg_parse_query)(e), _gettimeofday = Module._gettimeofday = (e, t2) => (_gettimeofday = Module._gettimeofday = wasmExports.gettimeofday)(e, t2), _raw_parser = Module._raw_parser = (e, t2) => (_raw_parser = Module._raw_parser = wasmExports.raw_parser)(e, t2), _initStringInfo = Module._initStringInfo = (e) => (_initStringInfo = Module._initStringInfo = wasmExports.initStringInfo)(e), _appendStringInfoString = Module._appendStringInfoString = (e, t2) => (_appendStringInfoString = Module._appendStringInfoString = wasmExports.appendStringInfoString)(e, t2), _appendStringInfo = Module._appendStringInfo = (e, t2, r) => (_appendStringInfo = Module._appendStringInfo = wasmExports.appendStringInfo)(e, t2, r), _errdetail_internal = Module._errdetail_internal = (e, t2) => (_errdetail_internal = Module._errdetail_internal = wasmExports.errdetail_internal)(e, t2), _pfree = Module._pfree = (e) => (_pfree = Module._pfree = wasmExports.pfree)(e), _list_make1_impl = Module._list_make1_impl = (e, t2) => (_list_make1_impl = Module._list_make1_impl = wasmExports.list_make1_impl)(e, t2), _QueryRewrite = Module._QueryRewrite = (e) => (_QueryRewrite = Module._QueryRewrite = wasmExports.QueryRewrite)(e), _pg_plan_query = Module._pg_plan_query = (e, t2, r, a2) => (_pg_plan_query = Module._pg_plan_query = wasmExports.pg_plan_query)(e, t2, r, a2), _palloc0 = Module._palloc0 = (e) => (_palloc0 = Module._palloc0 = wasmExports.palloc0)(e), _lappend = Module._lappend = (e, t2) => (_lappend = Module._lappend = wasmExports.lappend)(e, t2), _GetCurrentTimestamp = Module._GetCurrentTimestamp = () => (_GetCurrentTimestamp = Module._GetCurrentTimestamp = wasmExports.GetCurrentTimestamp)(), _pg_prng_double = Module._pg_prng_double = (e) => (_pg_prng_double = Module._pg_prng_double = wasmExports.pg_prng_double)(e), _pg_snprintf = Module._pg_snprintf = (e, t2, r, a2) => (_pg_snprintf = Module._pg_snprintf = wasmExports.pg_snprintf)(e, t2, r, a2), _die = Module._die = (e) => (_die = Module._die = wasmExports.die)(e), _check_stack_depth = Module._check_stack_depth = () => (_check_stack_depth = Module._check_stack_depth = wasmExports.check_stack_depth)(), _pre_format_elog_string = Module._pre_format_elog_string = (e, t2) => (_pre_format_elog_string = Module._pre_format_elog_string = wasmExports.pre_format_elog_string)(e, t2), _format_elog_string = Module._format_elog_string = (e, t2) => (_format_elog_string = Module._format_elog_string = wasmExports.format_elog_string)(e, t2), _pstrdup = Module._pstrdup = (e) => (_pstrdup = Module._pstrdup = wasmExports.pstrdup)(e), _SplitIdentifierString = Module._SplitIdentifierString = (e, t2, r) => (_SplitIdentifierString = Module._SplitIdentifierString = wasmExports.SplitIdentifierString)(e, t2, r), _list_free = Module._list_free = (e) => (_list_free = Module._list_free = wasmExports.list_free)(e), _pg_strcasecmp = Module._pg_strcasecmp = (e, t2) => (_pg_strcasecmp = Module._pg_strcasecmp = wasmExports.pg_strcasecmp)(e, t2), _guc_malloc = Module._guc_malloc = (e, t2) => (_guc_malloc = Module._guc_malloc = wasmExports.guc_malloc)(e, t2), _SetConfigOption = Module._SetConfigOption = (e, t2, r, a2) => (_SetConfigOption = Module._SetConfigOption = wasmExports.SetConfigOption)(e, t2, r, a2), _pg_sprintf = Module._pg_sprintf = (e, t2, r) => (_pg_sprintf = Module._pg_sprintf = wasmExports.pg_sprintf)(e, t2, r), _strcmp = Module._strcmp = (e, t2) => (_strcmp = Module._strcmp = wasmExports.strcmp)(e, t2), _strdup = Module._strdup = (e) => (_strdup = Module._strdup = wasmExports.strdup)(e), _atoi = Module._atoi = (e) => (_atoi = Module._atoi = wasmExports.atoi)(e), _strlcpy = Module._strlcpy = (e, t2, r) => (_strlcpy = Module._strlcpy = wasmExports.strlcpy)(e, t2, r), _pgl_shutdown = Module._pgl_shutdown = () => (_pgl_shutdown = Module._pgl_shutdown = wasmExports.pgl_shutdown)(), _pgl_closed = Module._pgl_closed = () => (_pgl_closed = Module._pgl_closed = wasmExports.pgl_closed)(), _MemoryContextReset = Module._MemoryContextReset = (e) => (_MemoryContextReset = Module._MemoryContextReset = wasmExports.MemoryContextReset)(e), _resetStringInfo = Module._resetStringInfo = (e) => (_resetStringInfo = Module._resetStringInfo = wasmExports.resetStringInfo)(e), _getc = Module._getc = (e) => (_getc = Module._getc = wasmExports.getc)(e), _appendStringInfoChar = Module._appendStringInfoChar = (e, t2) => (_appendStringInfoChar = Module._appendStringInfoChar = wasmExports.appendStringInfoChar)(e, t2), _strlen = Module._strlen = (e) => (_strlen = Module._strlen = wasmExports.strlen)(e), _strncmp = Module._strncmp = (e, t2, r) => (_strncmp = Module._strncmp = wasmExports.strncmp)(e, t2, r), _pg_fprintf = Module._pg_fprintf = (e, t2, r) => (_pg_fprintf = Module._pg_fprintf = wasmExports.pg_fprintf)(e, t2, r), _pgstat_report_activity = Module._pgstat_report_activity = (e, t2) => (_pgstat_report_activity = Module._pgstat_report_activity = wasmExports.pgstat_report_activity)(e, t2), _errhidestmt = Module._errhidestmt = (e) => (_errhidestmt = Module._errhidestmt = wasmExports.errhidestmt)(e), _GetTransactionSnapshot = Module._GetTransactionSnapshot = () => (_GetTransactionSnapshot = Module._GetTransactionSnapshot = wasmExports.GetTransactionSnapshot)(), _PushActiveSnapshot = Module._PushActiveSnapshot = (e) => (_PushActiveSnapshot = Module._PushActiveSnapshot = wasmExports.PushActiveSnapshot)(e), _AllocSetContextCreateInternal = Module._AllocSetContextCreateInternal = (e, t2, r, a2, o4) => (_AllocSetContextCreateInternal = Module._AllocSetContextCreateInternal = wasmExports.AllocSetContextCreateInternal)(e, t2, r, a2, o4), _PopActiveSnapshot = Module._PopActiveSnapshot = () => (_PopActiveSnapshot = Module._PopActiveSnapshot = wasmExports.PopActiveSnapshot)(), _CreateDestReceiver = Module._CreateDestReceiver = (e) => (_CreateDestReceiver = Module._CreateDestReceiver = wasmExports.CreateDestReceiver)(e), _CommitTransactionCommand = Module._CommitTransactionCommand = () => (_CommitTransactionCommand = Module._CommitTransactionCommand = wasmExports.CommitTransactionCommand)(), _CommandCounterIncrement = Module._CommandCounterIncrement = () => (_CommandCounterIncrement = Module._CommandCounterIncrement = wasmExports.CommandCounterIncrement)(), _MemoryContextDelete = Module._MemoryContextDelete = (e) => (_MemoryContextDelete = Module._MemoryContextDelete = wasmExports.MemoryContextDelete)(e), _StartTransactionCommand = Module._StartTransactionCommand = () => (_StartTransactionCommand = Module._StartTransactionCommand = wasmExports.StartTransactionCommand)(), ___wasm_setjmp_test = Module.___wasm_setjmp_test = (e, t2) => (___wasm_setjmp_test = Module.___wasm_setjmp_test = wasmExports.__wasm_setjmp_test)(e, t2), _pg_printf = Module._pg_printf = (e, t2) => (_pg_printf = Module._pg_printf = wasmExports.pg_printf)(e, t2), ___wasm_setjmp = Module.___wasm_setjmp = (e, t2, r) => (___wasm_setjmp = Module.___wasm_setjmp = wasmExports.__wasm_setjmp)(e, t2, r), _FlushErrorState = Module._FlushErrorState = () => (_FlushErrorState = Module._FlushErrorState = wasmExports.FlushErrorState)(), _emscripten_longjmp = Module._emscripten_longjmp = (e, t2) => (_emscripten_longjmp = Module._emscripten_longjmp = wasmExports.emscripten_longjmp)(e, t2), _enlargeStringInfo = Module._enlargeStringInfo = (e, t2) => (_enlargeStringInfo = Module._enlargeStringInfo = wasmExports.enlargeStringInfo)(e, t2), _malloc = Module._malloc = (e) => (_malloc = Module._malloc = wasmExports.malloc)(e), _realloc = Module._realloc = (e, t2) => (_realloc = Module._realloc = wasmExports.realloc)(e, t2), _getenv = Module._getenv = (e) => (_getenv = Module._getenv = wasmExports.getenv)(e), _strspn = Module._strspn = (e, t2) => (_strspn = Module._strspn = wasmExports.strspn)(e, t2), _memcpy = Module._memcpy = (e, t2, r) => (_memcpy = Module._memcpy = wasmExports.memcpy)(e, t2, r), _fileno = Module._fileno = (e) => (_fileno = Module._fileno = wasmExports.fileno)(e), _strchr = Module._strchr = (e, t2) => (_strchr = Module._strchr = wasmExports.strchr)(e, t2), _free = Module._free = (e) => (_free = Module._free = wasmExports.free)(e), _pg_vsnprintf = Module._pg_vsnprintf = (e, t2, r, a2) => (_pg_vsnprintf = Module._pg_vsnprintf = wasmExports.pg_vsnprintf)(e, t2, r, a2), _strcpy = Module._strcpy = (e, t2) => (_strcpy = Module._strcpy = wasmExports.strcpy)(e, t2), _psprintf = Module._psprintf = (e, t2) => (_psprintf = Module._psprintf = wasmExports.psprintf)(e, t2), _stat = Module._stat = (e, t2) => (_stat = Module._stat = wasmExports.stat)(e, t2), _fwrite = Module._fwrite = (e, t2, r, a2) => (_fwrite = Module._fwrite = wasmExports.fwrite)(e, t2, r, a2), _strftime = Module._strftime = (e, t2, r, a2) => (_strftime = Module._strftime = wasmExports.strftime)(e, t2, r, a2), _strstr = Module._strstr = (e, t2) => (_strstr = Module._strstr = wasmExports.strstr)(e, t2), _atexit = Module._atexit = (e) => (_atexit = Module._atexit = wasmExports.atexit)(e), _strtol = Module._strtol = (e, t2, r) => (_strtol = Module._strtol = wasmExports.strtol)(e, t2, r), _ferror = Module._ferror = (e) => (_ferror = Module._ferror = wasmExports.ferror)(e), _clear_error = Module._clear_error = () => (_clear_error = Module._clear_error = wasmExports.clear_error)(), _interactive_one = Module._interactive_one = (e, t2) => (_interactive_one = Module._interactive_one = wasmExports.interactive_one)(e, t2), _pq_getmsgint = Module._pq_getmsgint = (e, t2) => (_pq_getmsgint = Module._pq_getmsgint = wasmExports.pq_getmsgint)(e, t2), _palloc = Module._palloc = (e) => (_palloc = Module._palloc = wasmExports.palloc)(e), _makeParamList = Module._makeParamList = (e) => (_makeParamList = Module._makeParamList = wasmExports.makeParamList)(e), _getTypeInputInfo = Module._getTypeInputInfo = (e, t2, r) => (_getTypeInputInfo = Module._getTypeInputInfo = wasmExports.getTypeInputInfo)(e, t2, r), _pnstrdup = Module._pnstrdup = (e, t2) => (_pnstrdup = Module._pnstrdup = wasmExports.pnstrdup)(e, t2), _MemoryContextSetParent = Module._MemoryContextSetParent = (e, t2) => (_MemoryContextSetParent = Module._MemoryContextSetParent = wasmExports.MemoryContextSetParent)(e, t2), _pgl_backend = Module._pgl_backend = () => (_pgl_backend = Module._pgl_backend = wasmExports.pgl_backend)(), _pgl_initdb = Module._pgl_initdb = () => (_pgl_initdb = Module._pgl_initdb = wasmExports.pgl_initdb)(), _main = Module._main = (e, t2) => (_main = Module._main = wasmExports.__main_argc_argv)(e, t2), _appendStringInfoStringQuoted = Module._appendStringInfoStringQuoted = (e, t2, r) => (_appendStringInfoStringQuoted = Module._appendStringInfoStringQuoted = wasmExports.appendStringInfoStringQuoted)(e, t2, r), _set_errcontext_domain = Module._set_errcontext_domain = (e) => (_set_errcontext_domain = Module._set_errcontext_domain = wasmExports.set_errcontext_domain)(e), _errcontext_msg = Module._errcontext_msg = (e, t2) => (_errcontext_msg = Module._errcontext_msg = wasmExports.errcontext_msg)(e, t2), _pg_is_ascii = Module._pg_is_ascii = (e) => (_pg_is_ascii = Module._pg_is_ascii = wasmExports.pg_is_ascii)(e), _memchr = Module._memchr = (e, t2, r) => (_memchr = Module._memchr = wasmExports.memchr)(e, t2, r), _strrchr = Module._strrchr = (e, t2) => (_strrchr = Module._strrchr = wasmExports.strrchr)(e, t2), _xsltFreeStylesheet = Module._xsltFreeStylesheet = (e) => (_xsltFreeStylesheet = Module._xsltFreeStylesheet = wasmExports.xsltFreeStylesheet)(e), _xsltParseStylesheetDoc = Module._xsltParseStylesheetDoc = (e) => (_xsltParseStylesheetDoc = Module._xsltParseStylesheetDoc = wasmExports.xsltParseStylesheetDoc)(e), _xsltSaveResultToString = Module._xsltSaveResultToString = (e, t2, r, a2) => (_xsltSaveResultToString = Module._xsltSaveResultToString = wasmExports.xsltSaveResultToString)(e, t2, r, a2), _xsltCleanupGlobals = Module._xsltCleanupGlobals = () => (_xsltCleanupGlobals = Module._xsltCleanupGlobals = wasmExports.xsltCleanupGlobals)(), _xsltNewTransformContext = Module._xsltNewTransformContext = (e, t2) => (_xsltNewTransformContext = Module._xsltNewTransformContext = wasmExports.xsltNewTransformContext)(e, t2), _xsltFreeTransformContext = Module._xsltFreeTransformContext = (e) => (_xsltFreeTransformContext = Module._xsltFreeTransformContext = wasmExports.xsltFreeTransformContext)(e), _xsltApplyStylesheetUser = Module._xsltApplyStylesheetUser = (e, t2, r, a2, o4, s4) => (_xsltApplyStylesheetUser = Module._xsltApplyStylesheetUser = wasmExports.xsltApplyStylesheetUser)(e, t2, r, a2, o4, s4), _xsltNewSecurityPrefs = Module._xsltNewSecurityPrefs = () => (_xsltNewSecurityPrefs = Module._xsltNewSecurityPrefs = wasmExports.xsltNewSecurityPrefs)(), _xsltFreeSecurityPrefs = Module._xsltFreeSecurityPrefs = (e) => (_xsltFreeSecurityPrefs = Module._xsltFreeSecurityPrefs = wasmExports.xsltFreeSecurityPrefs)(e), _xsltSetSecurityPrefs = Module._xsltSetSecurityPrefs = (e, t2, r) => (_xsltSetSecurityPrefs = Module._xsltSetSecurityPrefs = wasmExports.xsltSetSecurityPrefs)(e, t2, r), _xsltSetCtxtSecurityPrefs = Module._xsltSetCtxtSecurityPrefs = (e, t2) => (_xsltSetCtxtSecurityPrefs = Module._xsltSetCtxtSecurityPrefs = wasmExports.xsltSetCtxtSecurityPrefs)(e, t2), _xsltSecurityForbid = Module._xsltSecurityForbid = (e, t2, r) => (_xsltSecurityForbid = Module._xsltSecurityForbid = wasmExports.xsltSecurityForbid)(e, t2, r), _replace_percent_placeholders = Module._replace_percent_placeholders = (e, t2, r, a2) => (_replace_percent_placeholders = Module._replace_percent_placeholders = wasmExports.replace_percent_placeholders)(e, t2, r, a2), _memset = Module._memset = (e, t2, r) => (_memset = Module._memset = wasmExports.memset)(e, t2, r), _MemoryContextAllocZero = Module._MemoryContextAllocZero = (e, t2) => (_MemoryContextAllocZero = Module._MemoryContextAllocZero = wasmExports.MemoryContextAllocZero)(e, t2), _MemoryContextAllocExtended = Module._MemoryContextAllocExtended = (e, t2, r) => (_MemoryContextAllocExtended = Module._MemoryContextAllocExtended = wasmExports.MemoryContextAllocExtended)(e, t2, r), _hash_bytes = Module._hash_bytes = (e, t2) => (_hash_bytes = Module._hash_bytes = wasmExports.hash_bytes)(e, t2), _memcmp = Module._memcmp = (e, t2, r) => (_memcmp = Module._memcmp = wasmExports.memcmp)(e, t2, r), _repalloc = Module._repalloc = (e, t2) => (_repalloc = Module._repalloc = wasmExports.repalloc)(e, t2), _pg_qsort = Module._pg_qsort = (e, t2, r, a2) => (_pg_qsort = Module._pg_qsort = wasmExports.pg_qsort)(e, t2, r, a2), _OpenTransientFile = Module._OpenTransientFile = (e, t2) => (_OpenTransientFile = Module._OpenTransientFile = wasmExports.OpenTransientFile)(e, t2), _errcode_for_file_access = Module._errcode_for_file_access = () => (_errcode_for_file_access = Module._errcode_for_file_access = wasmExports.errcode_for_file_access)(), _read = Module._read = (e, t2, r) => (_read = Module._read = wasmExports.read)(e, t2, r), _CloseTransientFile = Module._CloseTransientFile = (e) => (_CloseTransientFile = Module._CloseTransientFile = wasmExports.CloseTransientFile)(e), _time = Module._time = (e) => (_time = Module._time = wasmExports.time)(e), _close = Module._close = (e) => (_close = Module._close = wasmExports.close)(e), ___multi3 = Module.___multi3 = (e, t2, r, a2, o4) => (___multi3 = Module.___multi3 = wasmExports.__multi3)(e, t2, r, a2, o4), _isalnum = Module._isalnum = (e) => (_isalnum = Module._isalnum = wasmExports.isalnum)(e), _wait_result_to_str = Module._wait_result_to_str = (e) => (_wait_result_to_str = Module._wait_result_to_str = wasmExports.wait_result_to_str)(e), _float_to_shortest_decimal_bufn = Module._float_to_shortest_decimal_bufn = (e, t2) => (_float_to_shortest_decimal_bufn = Module._float_to_shortest_decimal_bufn = wasmExports.float_to_shortest_decimal_bufn)(e, t2), _float_to_shortest_decimal_buf = Module._float_to_shortest_decimal_buf = (e, t2) => (_float_to_shortest_decimal_buf = Module._float_to_shortest_decimal_buf = wasmExports.float_to_shortest_decimal_buf)(e, t2), _memmove = Module._memmove = (e, t2, r) => (_memmove = Module._memmove = wasmExports.memmove)(e, t2, r), _pwrite = Module._pwrite = (e, t2, r, a2) => (_pwrite = Module._pwrite = wasmExports.pwrite)(e, t2, r, a2), _hash_bytes_extended = Module._hash_bytes_extended = (e, t2, r) => (_hash_bytes_extended = Module._hash_bytes_extended = wasmExports.hash_bytes_extended)(e, t2, r), _calloc = (e, t2) => (_calloc = wasmExports.calloc)(e, t2), _IsValidJsonNumber = Module._IsValidJsonNumber = (e, t2) => (_IsValidJsonNumber = Module._IsValidJsonNumber = wasmExports.IsValidJsonNumber)(e, t2), _appendBinaryStringInfo = Module._appendBinaryStringInfo = (e, t2, r) => (_appendBinaryStringInfo = Module._appendBinaryStringInfo = wasmExports.appendBinaryStringInfo)(e, t2, r), _makeStringInfo = Module._makeStringInfo = () => (_makeStringInfo = Module._makeStringInfo = wasmExports.makeStringInfo)(), _GetDatabaseEncodingName = Module._GetDatabaseEncodingName = () => (_GetDatabaseEncodingName = Module._GetDatabaseEncodingName = wasmExports.GetDatabaseEncodingName)(), _ScanKeywordLookup = Module._ScanKeywordLookup = (e, t2) => (_ScanKeywordLookup = Module._ScanKeywordLookup = wasmExports.ScanKeywordLookup)(e, t2), _strtoul = Module._strtoul = (e, t2, r) => (_strtoul = Module._strtoul = wasmExports.strtoul)(e, t2, r), _sscanf = Module._sscanf = (e, t2, r) => (_sscanf = Module._sscanf = wasmExports.sscanf)(e, t2, r), _strtoull = Module._strtoull = (e, t2, r) => (_strtoull = Module._strtoull = wasmExports.strtoull)(e, t2, r), _pg_prng_uint64 = Module._pg_prng_uint64 = (e) => (_pg_prng_uint64 = Module._pg_prng_uint64 = wasmExports.pg_prng_uint64)(e), _pg_prng_uint32 = Module._pg_prng_uint32 = (e) => (_pg_prng_uint32 = Module._pg_prng_uint32 = wasmExports.pg_prng_uint32)(e), _log = Module._log = (e) => (_log = Module._log = wasmExports.log)(e), _sin = Module._sin = (e) => (_sin = Module._sin = wasmExports.sin)(e), _readdir = Module._readdir = (e) => (_readdir = Module._readdir = wasmExports.readdir)(e), _forkname_to_number = Module._forkname_to_number = (e) => (_forkname_to_number = Module._forkname_to_number = wasmExports.forkname_to_number)(e), _unlink = Module._unlink = (e) => (_unlink = Module._unlink = wasmExports.unlink)(e), _pg_utf_mblen_private = Module._pg_utf_mblen_private = (e) => (_pg_utf_mblen_private = Module._pg_utf_mblen_private = wasmExports.pg_utf_mblen_private)(e), _bsearch = Module._bsearch = (e, t2, r, a2, o4) => (_bsearch = Module._bsearch = wasmExports.bsearch)(e, t2, r, a2, o4), _palloc_extended = Module._palloc_extended = (e, t2) => (_palloc_extended = Module._palloc_extended = wasmExports.palloc_extended)(e, t2), _appendStringInfoSpaces = Module._appendStringInfoSpaces = (e, t2) => (_appendStringInfoSpaces = Module._appendStringInfoSpaces = wasmExports.appendStringInfoSpaces)(e, t2), _geteuid = Module._geteuid = () => (_geteuid = Module._geteuid = wasmExports.geteuid)(), _fcntl = Module._fcntl = (e, t2, r) => (_fcntl = Module._fcntl = wasmExports.fcntl)(e, t2, r), _pg_popcount_optimized = Module._pg_popcount_optimized = (e, t2) => (_pg_popcount_optimized = Module._pg_popcount_optimized = wasmExports.pg_popcount_optimized)(e, t2), _pg_strong_random = Module._pg_strong_random = (e, t2) => (_pg_strong_random = Module._pg_strong_random = wasmExports.pg_strong_random)(e, t2), _open = Module._open = (e, t2, r) => (_open = Module._open = wasmExports.open)(e, t2, r), _pg_usleep = Module._pg_usleep = (e) => (_pg_usleep = Module._pg_usleep = wasmExports.pg_usleep)(e), _nanosleep = Module._nanosleep = (e, t2) => (_nanosleep = Module._nanosleep = wasmExports.nanosleep)(e, t2), _getpid = Module._getpid = () => (_getpid = Module._getpid = wasmExports.getpid)(), _qsort_arg = Module._qsort_arg = (e, t2, r, a2, o4) => (_qsort_arg = Module._qsort_arg = wasmExports.qsort_arg)(e, t2, r, a2, o4), _strerror = Module._strerror = (e) => (_strerror = Module._strerror = wasmExports.strerror)(e), _RelationGetNumberOfBlocksInFork = Module._RelationGetNumberOfBlocksInFork = (e, t2) => (_RelationGetNumberOfBlocksInFork = Module._RelationGetNumberOfBlocksInFork = wasmExports.RelationGetNumberOfBlocksInFork)(e, t2), _ExtendBufferedRel = Module._ExtendBufferedRel = (e, t2, r, a2) => (_ExtendBufferedRel = Module._ExtendBufferedRel = wasmExports.ExtendBufferedRel)(e, t2, r, a2), _MarkBufferDirty = Module._MarkBufferDirty = (e) => (_MarkBufferDirty = Module._MarkBufferDirty = wasmExports.MarkBufferDirty)(e), _XLogBeginInsert = Module._XLogBeginInsert = () => (_XLogBeginInsert = Module._XLogBeginInsert = wasmExports.XLogBeginInsert)(), _XLogRegisterData = Module._XLogRegisterData = (e, t2) => (_XLogRegisterData = Module._XLogRegisterData = wasmExports.XLogRegisterData)(e, t2), _XLogInsert = Module._XLogInsert = (e, t2) => (_XLogInsert = Module._XLogInsert = wasmExports.XLogInsert)(e, t2), _UnlockReleaseBuffer = Module._UnlockReleaseBuffer = (e) => (_UnlockReleaseBuffer = Module._UnlockReleaseBuffer = wasmExports.UnlockReleaseBuffer)(e), _brin_build_desc = Module._brin_build_desc = (e) => (_brin_build_desc = Module._brin_build_desc = wasmExports.brin_build_desc)(e), _EnterParallelMode = Module._EnterParallelMode = () => (_EnterParallelMode = Module._EnterParallelMode = wasmExports.EnterParallelMode)(), _CreateParallelContext = Module._CreateParallelContext = (e, t2, r) => (_CreateParallelContext = Module._CreateParallelContext = wasmExports.CreateParallelContext)(e, t2, r), _RegisterSnapshot = Module._RegisterSnapshot = (e) => (_RegisterSnapshot = Module._RegisterSnapshot = wasmExports.RegisterSnapshot)(e), _table_parallelscan_estimate = Module._table_parallelscan_estimate = (e, t2) => (_table_parallelscan_estimate = Module._table_parallelscan_estimate = wasmExports.table_parallelscan_estimate)(e, t2), _add_size = Module._add_size = (e, t2) => (_add_size = Module._add_size = wasmExports.add_size)(e, t2), _tuplesort_estimate_shared = Module._tuplesort_estimate_shared = (e) => (_tuplesort_estimate_shared = Module._tuplesort_estimate_shared = wasmExports.tuplesort_estimate_shared)(e), _InitializeParallelDSM = Module._InitializeParallelDSM = (e) => (_InitializeParallelDSM = Module._InitializeParallelDSM = wasmExports.InitializeParallelDSM)(e), _UnregisterSnapshot = Module._UnregisterSnapshot = (e) => (_UnregisterSnapshot = Module._UnregisterSnapshot = wasmExports.UnregisterSnapshot)(e), _DestroyParallelContext = Module._DestroyParallelContext = (e) => (_DestroyParallelContext = Module._DestroyParallelContext = wasmExports.DestroyParallelContext)(e), _ExitParallelMode = Module._ExitParallelMode = () => (_ExitParallelMode = Module._ExitParallelMode = wasmExports.ExitParallelMode)(), _shm_toc_allocate = Module._shm_toc_allocate = (e, t2) => (_shm_toc_allocate = Module._shm_toc_allocate = wasmExports.shm_toc_allocate)(e, t2), _ConditionVariableInit = Module._ConditionVariableInit = (e) => (_ConditionVariableInit = Module._ConditionVariableInit = wasmExports.ConditionVariableInit)(e), _s_init_lock_sema = Module._s_init_lock_sema = (e, t2) => (_s_init_lock_sema = Module._s_init_lock_sema = wasmExports.s_init_lock_sema)(e, t2), _table_parallelscan_initialize = Module._table_parallelscan_initialize = (e, t2, r) => (_table_parallelscan_initialize = Module._table_parallelscan_initialize = wasmExports.table_parallelscan_initialize)(e, t2, r), _tuplesort_initialize_shared = Module._tuplesort_initialize_shared = (e, t2, r) => (_tuplesort_initialize_shared = Module._tuplesort_initialize_shared = wasmExports.tuplesort_initialize_shared)(e, t2, r), _shm_toc_insert = Module._shm_toc_insert = (e, t2, r) => (_shm_toc_insert = Module._shm_toc_insert = wasmExports.shm_toc_insert)(e, t2, r), _LaunchParallelWorkers = Module._LaunchParallelWorkers = (e) => (_LaunchParallelWorkers = Module._LaunchParallelWorkers = wasmExports.LaunchParallelWorkers)(e), _WaitForParallelWorkersToAttach = Module._WaitForParallelWorkersToAttach = (e) => (_WaitForParallelWorkersToAttach = Module._WaitForParallelWorkersToAttach = wasmExports.WaitForParallelWorkersToAttach)(e), _tas_sema = Module._tas_sema = (e) => (_tas_sema = Module._tas_sema = wasmExports.tas_sema)(e), _s_lock = Module._s_lock = (e, t2, r, a2) => (_s_lock = Module._s_lock = wasmExports.s_lock)(e, t2, r, a2), _s_unlock_sema = Module._s_unlock_sema = (e) => (_s_unlock_sema = Module._s_unlock_sema = wasmExports.s_unlock_sema)(e), _ConditionVariableSleep = Module._ConditionVariableSleep = (e, t2) => (_ConditionVariableSleep = Module._ConditionVariableSleep = wasmExports.ConditionVariableSleep)(e, t2), _ConditionVariableCancelSleep = Module._ConditionVariableCancelSleep = () => (_ConditionVariableCancelSleep = Module._ConditionVariableCancelSleep = wasmExports.ConditionVariableCancelSleep)(), _tuplesort_performsort = Module._tuplesort_performsort = (e) => (_tuplesort_performsort = Module._tuplesort_performsort = wasmExports.tuplesort_performsort)(e), _tuplesort_end = Module._tuplesort_end = (e) => (_tuplesort_end = Module._tuplesort_end = wasmExports.tuplesort_end)(e), _brin_deform_tuple = Module._brin_deform_tuple = (e, t2, r) => (_brin_deform_tuple = Module._brin_deform_tuple = wasmExports.brin_deform_tuple)(e, t2, r), _log_newpage_buffer = Module._log_newpage_buffer = (e, t2) => (_log_newpage_buffer = Module._log_newpage_buffer = wasmExports.log_newpage_buffer)(e, t2), _LockBuffer = Module._LockBuffer = (e, t2) => (_LockBuffer = Module._LockBuffer = wasmExports.LockBuffer)(e, t2), _ReleaseBuffer = Module._ReleaseBuffer = (e) => (_ReleaseBuffer = Module._ReleaseBuffer = wasmExports.ReleaseBuffer)(e), _IndexGetRelation = Module._IndexGetRelation = (e, t2) => (_IndexGetRelation = Module._IndexGetRelation = wasmExports.IndexGetRelation)(e, t2), _table_open = Module._table_open = (e, t2) => (_table_open = Module._table_open = wasmExports.table_open)(e, t2), _ReadBufferExtended = Module._ReadBufferExtended = (e, t2, r, a2, o4) => (_ReadBufferExtended = Module._ReadBufferExtended = wasmExports.ReadBufferExtended)(e, t2, r, a2, o4), _table_close = Module._table_close = (e, t2) => (_table_close = Module._table_close = wasmExports.table_close)(e, t2), _build_reloptions = Module._build_reloptions = (e, t2, r, a2, o4, s4) => (_build_reloptions = Module._build_reloptions = wasmExports.build_reloptions)(e, t2, r, a2, o4, s4), _RelationGetIndexScan = Module._RelationGetIndexScan = (e, t2, r) => (_RelationGetIndexScan = Module._RelationGetIndexScan = wasmExports.RelationGetIndexScan)(e, t2, r), _pgstat_assoc_relation = Module._pgstat_assoc_relation = (e) => (_pgstat_assoc_relation = Module._pgstat_assoc_relation = wasmExports.pgstat_assoc_relation)(e), _index_getprocinfo = Module._index_getprocinfo = (e, t2, r) => (_index_getprocinfo = Module._index_getprocinfo = wasmExports.index_getprocinfo)(e, t2, r), _fmgr_info_copy = Module._fmgr_info_copy = (e, t2, r) => (_fmgr_info_copy = Module._fmgr_info_copy = wasmExports.fmgr_info_copy)(e, t2, r), _FunctionCall4Coll = Module._FunctionCall4Coll = (e, t2, r, a2, o4, s4) => (_FunctionCall4Coll = Module._FunctionCall4Coll = wasmExports.FunctionCall4Coll)(e, t2, r, a2, o4, s4), _FunctionCall1Coll = Module._FunctionCall1Coll = (e, t2, r) => (_FunctionCall1Coll = Module._FunctionCall1Coll = wasmExports.FunctionCall1Coll)(e, t2, r), _brin_free_desc = Module._brin_free_desc = (e) => (_brin_free_desc = Module._brin_free_desc = wasmExports.brin_free_desc)(e), _WaitForParallelWorkersToFinish = Module._WaitForParallelWorkersToFinish = (e) => (_WaitForParallelWorkersToFinish = Module._WaitForParallelWorkersToFinish = wasmExports.WaitForParallelWorkersToFinish)(e), _PageGetFreeSpace = Module._PageGetFreeSpace = (e) => (_PageGetFreeSpace = Module._PageGetFreeSpace = wasmExports.PageGetFreeSpace)(e), _BufferGetBlockNumber = Module._BufferGetBlockNumber = (e) => (_BufferGetBlockNumber = Module._BufferGetBlockNumber = wasmExports.BufferGetBlockNumber)(e), _BuildIndexInfo = Module._BuildIndexInfo = (e) => (_BuildIndexInfo = Module._BuildIndexInfo = wasmExports.BuildIndexInfo)(e), _Int64GetDatum = Module._Int64GetDatum = (e) => (_Int64GetDatum = Module._Int64GetDatum = wasmExports.Int64GetDatum)(e), _DirectFunctionCall2Coll = Module._DirectFunctionCall2Coll = (e, t2, r, a2) => (_DirectFunctionCall2Coll = Module._DirectFunctionCall2Coll = wasmExports.DirectFunctionCall2Coll)(e, t2, r, a2), _RecoveryInProgress = Module._RecoveryInProgress = () => (_RecoveryInProgress = Module._RecoveryInProgress = wasmExports.RecoveryInProgress)(), _GetUserIdAndSecContext = Module._GetUserIdAndSecContext = (e, t2) => (_GetUserIdAndSecContext = Module._GetUserIdAndSecContext = wasmExports.GetUserIdAndSecContext)(e, t2), _SetUserIdAndSecContext = Module._SetUserIdAndSecContext = (e, t2) => (_SetUserIdAndSecContext = Module._SetUserIdAndSecContext = wasmExports.SetUserIdAndSecContext)(e, t2), _NewGUCNestLevel = Module._NewGUCNestLevel = () => (_NewGUCNestLevel = Module._NewGUCNestLevel = wasmExports.NewGUCNestLevel)(), _RestrictSearchPath = Module._RestrictSearchPath = () => (_RestrictSearchPath = Module._RestrictSearchPath = wasmExports.RestrictSearchPath)(), _index_open = Module._index_open = (e, t2) => (_index_open = Module._index_open = wasmExports.index_open)(e, t2), _object_ownercheck = Module._object_ownercheck = (e, t2, r) => (_object_ownercheck = Module._object_ownercheck = wasmExports.object_ownercheck)(e, t2, r), _aclcheck_error = Module._aclcheck_error = (e, t2, r) => (_aclcheck_error = Module._aclcheck_error = wasmExports.aclcheck_error)(e, t2, r), _AtEOXact_GUC = Module._AtEOXact_GUC = (e, t2) => (_AtEOXact_GUC = Module._AtEOXact_GUC = wasmExports.AtEOXact_GUC)(e, t2), _relation_close = Module._relation_close = (e, t2) => (_relation_close = Module._relation_close = wasmExports.relation_close)(e, t2), _GetUserId = Module._GetUserId = () => (_GetUserId = Module._GetUserId = wasmExports.GetUserId)(), _ReadBuffer = Module._ReadBuffer = (e, t2) => (_ReadBuffer = Module._ReadBuffer = wasmExports.ReadBuffer)(e, t2), _shm_toc_lookup = Module._shm_toc_lookup = (e, t2, r) => (_shm_toc_lookup = Module._shm_toc_lookup = wasmExports.shm_toc_lookup)(e, t2, r), _tuplesort_attach_shared = Module._tuplesort_attach_shared = (e, t2) => (_tuplesort_attach_shared = Module._tuplesort_attach_shared = wasmExports.tuplesort_attach_shared)(e, t2), _index_close = Module._index_close = (e, t2) => (_index_close = Module._index_close = wasmExports.index_close)(e, t2), _table_beginscan_parallel = Module._table_beginscan_parallel = (e, t2) => (_table_beginscan_parallel = Module._table_beginscan_parallel = wasmExports.table_beginscan_parallel)(e, t2), _ConditionVariableSignal = Module._ConditionVariableSignal = (e) => (_ConditionVariableSignal = Module._ConditionVariableSignal = wasmExports.ConditionVariableSignal)(e), _datumCopy = Module._datumCopy = (e, t2, r) => (_datumCopy = Module._datumCopy = wasmExports.datumCopy)(e, t2, r), _lookup_type_cache = Module._lookup_type_cache = (e, t2) => (_lookup_type_cache = Module._lookup_type_cache = wasmExports.lookup_type_cache)(e, t2), _get_fn_opclass_options = Module._get_fn_opclass_options = (e) => (_get_fn_opclass_options = Module._get_fn_opclass_options = wasmExports.get_fn_opclass_options)(e), _pg_detoast_datum = Module._pg_detoast_datum = (e) => (_pg_detoast_datum = Module._pg_detoast_datum = wasmExports.pg_detoast_datum)(e), _index_getprocid = Module._index_getprocid = (e, t2, r) => (_index_getprocid = Module._index_getprocid = wasmExports.index_getprocid)(e, t2, r), _init_local_reloptions = Module._init_local_reloptions = (e, t2) => (_init_local_reloptions = Module._init_local_reloptions = wasmExports.init_local_reloptions)(e, t2), _FunctionCall2Coll = Module._FunctionCall2Coll = (e, t2, r, a2) => (_FunctionCall2Coll = Module._FunctionCall2Coll = wasmExports.FunctionCall2Coll)(e, t2, r, a2), _SysCacheGetAttrNotNull = Module._SysCacheGetAttrNotNull = (e, t2, r) => (_SysCacheGetAttrNotNull = Module._SysCacheGetAttrNotNull = wasmExports.SysCacheGetAttrNotNull)(e, t2, r), _ReleaseSysCache = Module._ReleaseSysCache = (e) => (_ReleaseSysCache = Module._ReleaseSysCache = wasmExports.ReleaseSysCache)(e), _fmgr_info_cxt = Module._fmgr_info_cxt = (e, t2, r) => (_fmgr_info_cxt = Module._fmgr_info_cxt = wasmExports.fmgr_info_cxt)(e, t2, r), _Float8GetDatum = Module._Float8GetDatum = (e) => (_Float8GetDatum = Module._Float8GetDatum = wasmExports.Float8GetDatum)(e), _numeric_sub = Module._numeric_sub = (e) => (_numeric_sub = Module._numeric_sub = wasmExports.numeric_sub)(e), _DirectFunctionCall1Coll = Module._DirectFunctionCall1Coll = (e, t2, r) => (_DirectFunctionCall1Coll = Module._DirectFunctionCall1Coll = wasmExports.DirectFunctionCall1Coll)(e, t2, r), _pg_detoast_datum_packed = Module._pg_detoast_datum_packed = (e) => (_pg_detoast_datum_packed = Module._pg_detoast_datum_packed = wasmExports.pg_detoast_datum_packed)(e), _add_local_int_reloption = Module._add_local_int_reloption = (e, t2, r, a2, o4, s4, n3) => (_add_local_int_reloption = Module._add_local_int_reloption = wasmExports.add_local_int_reloption)(e, t2, r, a2, o4, s4, n3), _getTypeOutputInfo = Module._getTypeOutputInfo = (e, t2, r) => (_getTypeOutputInfo = Module._getTypeOutputInfo = wasmExports.getTypeOutputInfo)(e, t2, r), _fmgr_info = Module._fmgr_info = (e, t2) => (_fmgr_info = Module._fmgr_info = wasmExports.fmgr_info)(e, t2), _OutputFunctionCall = Module._OutputFunctionCall = (e, t2) => (_OutputFunctionCall = Module._OutputFunctionCall = wasmExports.OutputFunctionCall)(e, t2), _cstring_to_text_with_len = Module._cstring_to_text_with_len = (e, t2) => (_cstring_to_text_with_len = Module._cstring_to_text_with_len = wasmExports.cstring_to_text_with_len)(e, t2), _accumArrayResult = Module._accumArrayResult = (e, t2, r, a2, o4) => (_accumArrayResult = Module._accumArrayResult = wasmExports.accumArrayResult)(e, t2, r, a2, o4), _makeArrayResult = Module._makeArrayResult = (e, t2) => (_makeArrayResult = Module._makeArrayResult = wasmExports.makeArrayResult)(e, t2), _OidOutputFunctionCall = Module._OidOutputFunctionCall = (e, t2) => (_OidOutputFunctionCall = Module._OidOutputFunctionCall = wasmExports.OidOutputFunctionCall)(e, t2), _cstring_to_text = Module._cstring_to_text = (e) => (_cstring_to_text = Module._cstring_to_text = wasmExports.cstring_to_text)(e), _PageGetExactFreeSpace = Module._PageGetExactFreeSpace = (e) => (_PageGetExactFreeSpace = Module._PageGetExactFreeSpace = wasmExports.PageGetExactFreeSpace)(e), _PageIndexTupleOverwrite = Module._PageIndexTupleOverwrite = (e, t2, r, a2) => (_PageIndexTupleOverwrite = Module._PageIndexTupleOverwrite = wasmExports.PageIndexTupleOverwrite)(e, t2, r, a2), _PageInit = Module._PageInit = (e, t2, r) => (_PageInit = Module._PageInit = wasmExports.PageInit)(e, t2, r), _PageAddItemExtended = Module._PageAddItemExtended = (e, t2, r, a2, o4) => (_PageAddItemExtended = Module._PageAddItemExtended = wasmExports.PageAddItemExtended)(e, t2, r, a2, o4), _LockRelationForExtension = Module._LockRelationForExtension = (e, t2) => (_LockRelationForExtension = Module._LockRelationForExtension = wasmExports.LockRelationForExtension)(e, t2), _UnlockRelationForExtension = Module._UnlockRelationForExtension = (e, t2) => (_UnlockRelationForExtension = Module._UnlockRelationForExtension = wasmExports.UnlockRelationForExtension)(e, t2), _smgropen = Module._smgropen = (e, t2) => (_smgropen = Module._smgropen = wasmExports.smgropen)(e, t2), _smgrpin = Module._smgrpin = (e) => (_smgrpin = Module._smgrpin = wasmExports.smgrpin)(e), _ItemPointerEquals = Module._ItemPointerEquals = (e, t2) => (_ItemPointerEquals = Module._ItemPointerEquals = wasmExports.ItemPointerEquals)(e, t2), _detoast_external_attr = Module._detoast_external_attr = (e) => (_detoast_external_attr = Module._detoast_external_attr = wasmExports.detoast_external_attr)(e), _CreateTemplateTupleDesc = Module._CreateTemplateTupleDesc = (e) => (_CreateTemplateTupleDesc = Module._CreateTemplateTupleDesc = wasmExports.CreateTemplateTupleDesc)(e), _TupleDescInitEntry = Module._TupleDescInitEntry = (e, t2, r, a2, o4, s4) => (_TupleDescInitEntry = Module._TupleDescInitEntry = wasmExports.TupleDescInitEntry)(e, t2, r, a2, o4, s4), _SearchSysCache1 = Module._SearchSysCache1 = (e, t2) => (_SearchSysCache1 = Module._SearchSysCache1 = wasmExports.SearchSysCache1)(e, t2), _SearchSysCacheList = Module._SearchSysCacheList = (e, t2, r, a2, o4) => (_SearchSysCacheList = Module._SearchSysCacheList = wasmExports.SearchSysCacheList)(e, t2, r, a2, o4), _check_amproc_signature = Module._check_amproc_signature = (e, t2, r, a2, o4, s4) => (_check_amproc_signature = Module._check_amproc_signature = wasmExports.check_amproc_signature)(e, t2, r, a2, o4, s4), _check_amoptsproc_signature = Module._check_amoptsproc_signature = (e) => (_check_amoptsproc_signature = Module._check_amoptsproc_signature = wasmExports.check_amoptsproc_signature)(e), _format_procedure = Module._format_procedure = (e) => (_format_procedure = Module._format_procedure = wasmExports.format_procedure)(e), _format_operator = Module._format_operator = (e) => (_format_operator = Module._format_operator = wasmExports.format_operator)(e), _check_amop_signature = Module._check_amop_signature = (e, t2, r, a2) => (_check_amop_signature = Module._check_amop_signature = wasmExports.check_amop_signature)(e, t2, r, a2), _identify_opfamily_groups = Module._identify_opfamily_groups = (e, t2) => (_identify_opfamily_groups = Module._identify_opfamily_groups = wasmExports.identify_opfamily_groups)(e, t2), _format_type_be = Module._format_type_be = (e) => (_format_type_be = Module._format_type_be = wasmExports.format_type_be)(e), _ReleaseCatCacheList = Module._ReleaseCatCacheList = (e) => (_ReleaseCatCacheList = Module._ReleaseCatCacheList = wasmExports.ReleaseCatCacheList)(e), _format_type_with_typemod = Module._format_type_with_typemod = (e, t2) => (_format_type_with_typemod = Module._format_type_with_typemod = wasmExports.format_type_with_typemod)(e, t2), _DatumGetEOHP = Module._DatumGetEOHP = (e) => (_DatumGetEOHP = Module._DatumGetEOHP = wasmExports.DatumGetEOHP)(e), _EOH_get_flat_size = Module._EOH_get_flat_size = (e) => (_EOH_get_flat_size = Module._EOH_get_flat_size = wasmExports.EOH_get_flat_size)(e), _EOH_flatten_into = Module._EOH_flatten_into = (e, t2, r) => (_EOH_flatten_into = Module._EOH_flatten_into = wasmExports.EOH_flatten_into)(e, t2, r), _getmissingattr = Module._getmissingattr = (e, t2, r) => (_getmissingattr = Module._getmissingattr = wasmExports.getmissingattr)(e, t2, r), _hash_create = Module._hash_create = (e, t2, r, a2) => (_hash_create = Module._hash_create = wasmExports.hash_create)(e, t2, r, a2), _hash_search = Module._hash_search = (e, t2, r, a2) => (_hash_search = Module._hash_search = wasmExports.hash_search)(e, t2, r, a2), _nocachegetattr = Module._nocachegetattr = (e, t2, r) => (_nocachegetattr = Module._nocachegetattr = wasmExports.nocachegetattr)(e, t2, r), _heap_form_tuple = Module._heap_form_tuple = (e, t2, r) => (_heap_form_tuple = Module._heap_form_tuple = wasmExports.heap_form_tuple)(e, t2, r), _heap_modify_tuple = Module._heap_modify_tuple = (e, t2, r, a2, o4) => (_heap_modify_tuple = Module._heap_modify_tuple = wasmExports.heap_modify_tuple)(e, t2, r, a2, o4), _heap_deform_tuple = Module._heap_deform_tuple = (e, t2, r, a2) => (_heap_deform_tuple = Module._heap_deform_tuple = wasmExports.heap_deform_tuple)(e, t2, r, a2), _heap_modify_tuple_by_cols = Module._heap_modify_tuple_by_cols = (e, t2, r, a2, o4, s4) => (_heap_modify_tuple_by_cols = Module._heap_modify_tuple_by_cols = wasmExports.heap_modify_tuple_by_cols)(e, t2, r, a2, o4, s4), _heap_freetuple = Module._heap_freetuple = (e) => (_heap_freetuple = Module._heap_freetuple = wasmExports.heap_freetuple)(e), _index_form_tuple = Module._index_form_tuple = (e, t2, r) => (_index_form_tuple = Module._index_form_tuple = wasmExports.index_form_tuple)(e, t2, r), _nocache_index_getattr = Module._nocache_index_getattr = (e, t2, r) => (_nocache_index_getattr = Module._nocache_index_getattr = wasmExports.nocache_index_getattr)(e, t2, r), _index_deform_tuple = Module._index_deform_tuple = (e, t2, r, a2) => (_index_deform_tuple = Module._index_deform_tuple = wasmExports.index_deform_tuple)(e, t2, r, a2), _slot_getsomeattrs_int = Module._slot_getsomeattrs_int = (e, t2) => (_slot_getsomeattrs_int = Module._slot_getsomeattrs_int = wasmExports.slot_getsomeattrs_int)(e, t2), _pg_ltoa = Module._pg_ltoa = (e, t2) => (_pg_ltoa = Module._pg_ltoa = wasmExports.pg_ltoa)(e, t2), _relation_open = Module._relation_open = (e, t2) => (_relation_open = Module._relation_open = wasmExports.relation_open)(e, t2), _LockRelationOid = Module._LockRelationOid = (e, t2) => (_LockRelationOid = Module._LockRelationOid = wasmExports.LockRelationOid)(e, t2), _try_relation_open = Module._try_relation_open = (e, t2) => (_try_relation_open = Module._try_relation_open = wasmExports.try_relation_open)(e, t2), _relation_openrv = Module._relation_openrv = (e, t2) => (_relation_openrv = Module._relation_openrv = wasmExports.relation_openrv)(e, t2), _RangeVarGetRelidExtended = Module._RangeVarGetRelidExtended = (e, t2, r, a2, o4) => (_RangeVarGetRelidExtended = Module._RangeVarGetRelidExtended = wasmExports.RangeVarGetRelidExtended)(e, t2, r, a2, o4), _add_reloption_kind = Module._add_reloption_kind = () => (_add_reloption_kind = Module._add_reloption_kind = wasmExports.add_reloption_kind)(), _register_reloptions_validator = Module._register_reloptions_validator = (e, t2) => (_register_reloptions_validator = Module._register_reloptions_validator = wasmExports.register_reloptions_validator)(e, t2), _add_int_reloption = Module._add_int_reloption = (e, t2, r, a2, o4, s4, n3) => (_add_int_reloption = Module._add_int_reloption = wasmExports.add_int_reloption)(e, t2, r, a2, o4, s4, n3), _MemoryContextStrdup = Module._MemoryContextStrdup = (e, t2) => (_MemoryContextStrdup = Module._MemoryContextStrdup = wasmExports.MemoryContextStrdup)(e, t2), _transformRelOptions = Module._transformRelOptions = (e, t2, r, a2, o4, s4) => (_transformRelOptions = Module._transformRelOptions = wasmExports.transformRelOptions)(e, t2, r, a2, o4, s4), _deconstruct_array_builtin = Module._deconstruct_array_builtin = (e, t2, r, a2, o4) => (_deconstruct_array_builtin = Module._deconstruct_array_builtin = wasmExports.deconstruct_array_builtin)(e, t2, r, a2, o4), _defGetString = Module._defGetString = (e) => (_defGetString = Module._defGetString = wasmExports.defGetString)(e), _defGetBoolean = Module._defGetBoolean = (e) => (_defGetBoolean = Module._defGetBoolean = wasmExports.defGetBoolean)(e), _untransformRelOptions = Module._untransformRelOptions = (e) => (_untransformRelOptions = Module._untransformRelOptions = wasmExports.untransformRelOptions)(e), _text_to_cstring = Module._text_to_cstring = (e) => (_text_to_cstring = Module._text_to_cstring = wasmExports.text_to_cstring)(e), _makeString = Module._makeString = (e) => (_makeString = Module._makeString = wasmExports.makeString)(e), _makeDefElem = Module._makeDefElem = (e, t2, r) => (_makeDefElem = Module._makeDefElem = wasmExports.makeDefElem)(e, t2, r), _heap_reloptions = Module._heap_reloptions = (e, t2, r) => (_heap_reloptions = Module._heap_reloptions = wasmExports.heap_reloptions)(e, t2, r), _MemoryContextAlloc = Module._MemoryContextAlloc = (e, t2) => (_MemoryContextAlloc = Module._MemoryContextAlloc = wasmExports.MemoryContextAlloc)(e, t2), _parse_bool = Module._parse_bool = (e, t2) => (_parse_bool = Module._parse_bool = wasmExports.parse_bool)(e, t2), _parse_int = Module._parse_int = (e, t2, r, a2) => (_parse_int = Module._parse_int = wasmExports.parse_int)(e, t2, r, a2), _parse_real = Module._parse_real = (e, t2, r, a2) => (_parse_real = Module._parse_real = wasmExports.parse_real)(e, t2, r, a2), _ScanKeyInit = Module._ScanKeyInit = (e, t2, r, a2, o4) => (_ScanKeyInit = Module._ScanKeyInit = wasmExports.ScanKeyInit)(e, t2, r, a2, o4), _dsm_segment_handle = Module._dsm_segment_handle = (e) => (_dsm_segment_handle = Module._dsm_segment_handle = wasmExports.dsm_segment_handle)(e), _dsm_create = Module._dsm_create = (e, t2) => (_dsm_create = Module._dsm_create = wasmExports.dsm_create)(e, t2), _dsm_segment_address = Module._dsm_segment_address = (e) => (_dsm_segment_address = Module._dsm_segment_address = wasmExports.dsm_segment_address)(e), _dsm_attach = Module._dsm_attach = (e) => (_dsm_attach = Module._dsm_attach = wasmExports.dsm_attach)(e), _dsm_detach = Module._dsm_detach = (e) => (_dsm_detach = Module._dsm_detach = wasmExports.dsm_detach)(e), _ShmemInitStruct = Module._ShmemInitStruct = (e, t2, r) => (_ShmemInitStruct = Module._ShmemInitStruct = wasmExports.ShmemInitStruct)(e, t2, r), _LWLockAcquire = Module._LWLockAcquire = (e, t2) => (_LWLockAcquire = Module._LWLockAcquire = wasmExports.LWLockAcquire)(e, t2), _LWLockRelease = Module._LWLockRelease = (e) => (_LWLockRelease = Module._LWLockRelease = wasmExports.LWLockRelease)(e), _LWLockInitialize = Module._LWLockInitialize = (e, t2) => (_LWLockInitialize = Module._LWLockInitialize = wasmExports.LWLockInitialize)(e, t2), _MemoryContextMemAllocated = Module._MemoryContextMemAllocated = (e, t2) => (_MemoryContextMemAllocated = Module._MemoryContextMemAllocated = wasmExports.MemoryContextMemAllocated)(e, t2), _GetCurrentCommandId = Module._GetCurrentCommandId = (e) => (_GetCurrentCommandId = Module._GetCurrentCommandId = wasmExports.GetCurrentCommandId)(e), _toast_open_indexes = Module._toast_open_indexes = (e, t2, r, a2) => (_toast_open_indexes = Module._toast_open_indexes = wasmExports.toast_open_indexes)(e, t2, r, a2), _RelationGetIndexList = Module._RelationGetIndexList = (e) => (_RelationGetIndexList = Module._RelationGetIndexList = wasmExports.RelationGetIndexList)(e), _systable_beginscan = Module._systable_beginscan = (e, t2, r, a2, o4, s4) => (_systable_beginscan = Module._systable_beginscan = wasmExports.systable_beginscan)(e, t2, r, a2, o4, s4), _systable_getnext = Module._systable_getnext = (e) => (_systable_getnext = Module._systable_getnext = wasmExports.systable_getnext)(e), _systable_endscan = Module._systable_endscan = (e) => (_systable_endscan = Module._systable_endscan = wasmExports.systable_endscan)(e), _toast_close_indexes = Module._toast_close_indexes = (e, t2, r) => (_toast_close_indexes = Module._toast_close_indexes = wasmExports.toast_close_indexes)(e, t2, r), _systable_beginscan_ordered = Module._systable_beginscan_ordered = (e, t2, r, a2, o4) => (_systable_beginscan_ordered = Module._systable_beginscan_ordered = wasmExports.systable_beginscan_ordered)(e, t2, r, a2, o4), _systable_getnext_ordered = Module._systable_getnext_ordered = (e, t2) => (_systable_getnext_ordered = Module._systable_getnext_ordered = wasmExports.systable_getnext_ordered)(e, t2), _systable_endscan_ordered = Module._systable_endscan_ordered = (e) => (_systable_endscan_ordered = Module._systable_endscan_ordered = wasmExports.systable_endscan_ordered)(e), _init_toast_snapshot = Module._init_toast_snapshot = (e) => (_init_toast_snapshot = Module._init_toast_snapshot = wasmExports.init_toast_snapshot)(e), _convert_tuples_by_position = Module._convert_tuples_by_position = (e, t2, r) => (_convert_tuples_by_position = Module._convert_tuples_by_position = wasmExports.convert_tuples_by_position)(e, t2, r), _execute_attr_map_tuple = Module._execute_attr_map_tuple = (e, t2) => (_execute_attr_map_tuple = Module._execute_attr_map_tuple = wasmExports.execute_attr_map_tuple)(e, t2), _ExecStoreVirtualTuple = Module._ExecStoreVirtualTuple = (e) => (_ExecStoreVirtualTuple = Module._ExecStoreVirtualTuple = wasmExports.ExecStoreVirtualTuple)(e), _bms_is_member = Module._bms_is_member = (e, t2) => (_bms_is_member = Module._bms_is_member = wasmExports.bms_is_member)(e, t2), _bms_add_member = Module._bms_add_member = (e, t2) => (_bms_add_member = Module._bms_add_member = wasmExports.bms_add_member)(e, t2), _CreateTupleDescCopy = Module._CreateTupleDescCopy = (e) => (_CreateTupleDescCopy = Module._CreateTupleDescCopy = wasmExports.CreateTupleDescCopy)(e), _ResourceOwnerEnlarge = Module._ResourceOwnerEnlarge = (e) => (_ResourceOwnerEnlarge = Module._ResourceOwnerEnlarge = wasmExports.ResourceOwnerEnlarge)(e), _ResourceOwnerRemember = Module._ResourceOwnerRemember = (e, t2, r) => (_ResourceOwnerRemember = Module._ResourceOwnerRemember = wasmExports.ResourceOwnerRemember)(e, t2, r), _DecrTupleDescRefCount = Module._DecrTupleDescRefCount = (e) => (_DecrTupleDescRefCount = Module._DecrTupleDescRefCount = wasmExports.DecrTupleDescRefCount)(e), _ResourceOwnerForget = Module._ResourceOwnerForget = (e, t2, r) => (_ResourceOwnerForget = Module._ResourceOwnerForget = wasmExports.ResourceOwnerForget)(e, t2, r), _datumIsEqual = Module._datumIsEqual = (e, t2, r, a2) => (_datumIsEqual = Module._datumIsEqual = wasmExports.datumIsEqual)(e, t2, r, a2), _TupleDescInitEntryCollation = Module._TupleDescInitEntryCollation = (e, t2, r) => (_TupleDescInitEntryCollation = Module._TupleDescInitEntryCollation = wasmExports.TupleDescInitEntryCollation)(e, t2, r), _stringToNode = Module._stringToNode = (e) => (_stringToNode = Module._stringToNode = wasmExports.stringToNode)(e), _pg_detoast_datum_copy = Module._pg_detoast_datum_copy = (e) => (_pg_detoast_datum_copy = Module._pg_detoast_datum_copy = wasmExports.pg_detoast_datum_copy)(e), _get_typlenbyvalalign = Module._get_typlenbyvalalign = (e, t2, r, a2) => (_get_typlenbyvalalign = Module._get_typlenbyvalalign = wasmExports.get_typlenbyvalalign)(e, t2, r, a2), _deconstruct_array = Module._deconstruct_array = (e, t2, r, a2, o4, s4, n3, _3) => (_deconstruct_array = Module._deconstruct_array = wasmExports.deconstruct_array)(e, t2, r, a2, o4, s4, n3, _3), _tbm_add_tuples = Module._tbm_add_tuples = (e, t2, r, a2) => (_tbm_add_tuples = Module._tbm_add_tuples = wasmExports.tbm_add_tuples)(e, t2, r, a2), _ginPostingListDecode = Module._ginPostingListDecode = (e, t2) => (_ginPostingListDecode = Module._ginPostingListDecode = wasmExports.ginPostingListDecode)(e, t2), _ItemPointerCompare = Module._ItemPointerCompare = (e, t2) => (_ItemPointerCompare = Module._ItemPointerCompare = wasmExports.ItemPointerCompare)(e, t2), _LockPage = Module._LockPage = (e, t2, r) => (_LockPage = Module._LockPage = wasmExports.LockPage)(e, t2, r), _UnlockPage = Module._UnlockPage = (e, t2, r) => (_UnlockPage = Module._UnlockPage = wasmExports.UnlockPage)(e, t2, r), _vacuum_delay_point = Module._vacuum_delay_point = () => (_vacuum_delay_point = Module._vacuum_delay_point = wasmExports.vacuum_delay_point)(), _RecordFreeIndexPage = Module._RecordFreeIndexPage = (e, t2) => (_RecordFreeIndexPage = Module._RecordFreeIndexPage = wasmExports.RecordFreeIndexPage)(e, t2), _IndexFreeSpaceMapVacuum = Module._IndexFreeSpaceMapVacuum = (e) => (_IndexFreeSpaceMapVacuum = Module._IndexFreeSpaceMapVacuum = wasmExports.IndexFreeSpaceMapVacuum)(e), _log_newpage_range = Module._log_newpage_range = (e, t2, r, a2, o4) => (_log_newpage_range = Module._log_newpage_range = wasmExports.log_newpage_range)(e, t2, r, a2, o4), _GetFreeIndexPage = Module._GetFreeIndexPage = (e) => (_GetFreeIndexPage = Module._GetFreeIndexPage = wasmExports.GetFreeIndexPage)(e), _ConditionalLockBuffer = Module._ConditionalLockBuffer = (e) => (_ConditionalLockBuffer = Module._ConditionalLockBuffer = wasmExports.ConditionalLockBuffer)(e), _LockBufferForCleanup = Module._LockBufferForCleanup = (e) => (_LockBufferForCleanup = Module._LockBufferForCleanup = wasmExports.LockBufferForCleanup)(e), _gistcheckpage = Module._gistcheckpage = (e, t2) => (_gistcheckpage = Module._gistcheckpage = wasmExports.gistcheckpage)(e, t2), _PageIndexMultiDelete = Module._PageIndexMultiDelete = (e, t2, r) => (_PageIndexMultiDelete = Module._PageIndexMultiDelete = wasmExports.PageIndexMultiDelete)(e, t2, r), _smgrnblocks = Module._smgrnblocks = (e, t2) => (_smgrnblocks = Module._smgrnblocks = wasmExports.smgrnblocks)(e, t2), _list_free_deep = Module._list_free_deep = (e) => (_list_free_deep = Module._list_free_deep = wasmExports.list_free_deep)(e), _pairingheap_remove_first = Module._pairingheap_remove_first = (e) => (_pairingheap_remove_first = Module._pairingheap_remove_first = wasmExports.pairingheap_remove_first)(e), _pairingheap_add = Module._pairingheap_add = (e, t2) => (_pairingheap_add = Module._pairingheap_add = wasmExports.pairingheap_add)(e, t2), _float_overflow_error = Module._float_overflow_error = () => (_float_overflow_error = Module._float_overflow_error = wasmExports.float_overflow_error)(), _float_underflow_error = Module._float_underflow_error = () => (_float_underflow_error = Module._float_underflow_error = wasmExports.float_underflow_error)(), _DirectFunctionCall5Coll = Module._DirectFunctionCall5Coll = (e, t2, r, a2, o4, s4, n3) => (_DirectFunctionCall5Coll = Module._DirectFunctionCall5Coll = wasmExports.DirectFunctionCall5Coll)(e, t2, r, a2, o4, s4, n3), _pairingheap_allocate = Module._pairingheap_allocate = (e, t2) => (_pairingheap_allocate = Module._pairingheap_allocate = wasmExports.pairingheap_allocate)(e, t2), _GenerationContextCreate = Module._GenerationContextCreate = (e, t2, r, a2, o4) => (_GenerationContextCreate = Module._GenerationContextCreate = wasmExports.GenerationContextCreate)(e, t2, r, a2, o4), _pgstat_progress_update_param = Module._pgstat_progress_update_param = (e, t2) => (_pgstat_progress_update_param = Module._pgstat_progress_update_param = wasmExports.pgstat_progress_update_param)(e, t2), __hash_getbuf = Module.__hash_getbuf = (e, t2, r, a2) => (__hash_getbuf = Module.__hash_getbuf = wasmExports._hash_getbuf)(e, t2, r, a2), __hash_relbuf = Module.__hash_relbuf = (e, t2) => (__hash_relbuf = Module.__hash_relbuf = wasmExports._hash_relbuf)(e, t2), __hash_get_indextuple_hashkey = Module.__hash_get_indextuple_hashkey = (e) => (__hash_get_indextuple_hashkey = Module.__hash_get_indextuple_hashkey = wasmExports._hash_get_indextuple_hashkey)(e), __hash_getbuf_with_strategy = Module.__hash_getbuf_with_strategy = (e, t2, r, a2, o4) => (__hash_getbuf_with_strategy = Module.__hash_getbuf_with_strategy = wasmExports._hash_getbuf_with_strategy)(e, t2, r, a2, o4), __hash_ovflblkno_to_bitno = Module.__hash_ovflblkno_to_bitno = (e, t2) => (__hash_ovflblkno_to_bitno = Module.__hash_ovflblkno_to_bitno = wasmExports._hash_ovflblkno_to_bitno)(e, t2), _list_member_oid = Module._list_member_oid = (e, t2) => (_list_member_oid = Module._list_member_oid = wasmExports.list_member_oid)(e, t2), _HeapTupleSatisfiesVisibility = Module._HeapTupleSatisfiesVisibility = (e, t2, r) => (_HeapTupleSatisfiesVisibility = Module._HeapTupleSatisfiesVisibility = wasmExports.HeapTupleSatisfiesVisibility)(e, t2, r), _read_stream_begin_relation = Module._read_stream_begin_relation = (e, t2, r, a2, o4, s4, n3) => (_read_stream_begin_relation = Module._read_stream_begin_relation = wasmExports.read_stream_begin_relation)(e, t2, r, a2, o4, s4, n3), _GetAccessStrategy = Module._GetAccessStrategy = (e) => (_GetAccessStrategy = Module._GetAccessStrategy = wasmExports.GetAccessStrategy)(e), _FreeAccessStrategy = Module._FreeAccessStrategy = (e) => (_FreeAccessStrategy = Module._FreeAccessStrategy = wasmExports.FreeAccessStrategy)(e), _read_stream_end = Module._read_stream_end = (e) => (_read_stream_end = Module._read_stream_end = wasmExports.read_stream_end)(e), _heap_getnext = Module._heap_getnext = (e, t2) => (_heap_getnext = Module._heap_getnext = wasmExports.heap_getnext)(e, t2), _HeapTupleSatisfiesVacuum = Module._HeapTupleSatisfiesVacuum = (e, t2, r) => (_HeapTupleSatisfiesVacuum = Module._HeapTupleSatisfiesVacuum = wasmExports.HeapTupleSatisfiesVacuum)(e, t2, r), _GetMultiXactIdMembers = Module._GetMultiXactIdMembers = (e, t2, r, a2) => (_GetMultiXactIdMembers = Module._GetMultiXactIdMembers = wasmExports.GetMultiXactIdMembers)(e, t2, r, a2), _TransactionIdPrecedes = Module._TransactionIdPrecedes = (e, t2) => (_TransactionIdPrecedes = Module._TransactionIdPrecedes = wasmExports.TransactionIdPrecedes)(e, t2), _HeapTupleGetUpdateXid = Module._HeapTupleGetUpdateXid = (e) => (_HeapTupleGetUpdateXid = Module._HeapTupleGetUpdateXid = wasmExports.HeapTupleGetUpdateXid)(e), _visibilitymap_clear = Module._visibilitymap_clear = (e, t2, r, a2) => (_visibilitymap_clear = Module._visibilitymap_clear = wasmExports.visibilitymap_clear)(e, t2, r, a2), _pgstat_count_heap_insert = Module._pgstat_count_heap_insert = (e, t2) => (_pgstat_count_heap_insert = Module._pgstat_count_heap_insert = wasmExports.pgstat_count_heap_insert)(e, t2), _ExecFetchSlotHeapTuple = Module._ExecFetchSlotHeapTuple = (e, t2, r) => (_ExecFetchSlotHeapTuple = Module._ExecFetchSlotHeapTuple = wasmExports.ExecFetchSlotHeapTuple)(e, t2, r), _PageGetHeapFreeSpace = Module._PageGetHeapFreeSpace = (e) => (_PageGetHeapFreeSpace = Module._PageGetHeapFreeSpace = wasmExports.PageGetHeapFreeSpace)(e), _visibilitymap_pin = Module._visibilitymap_pin = (e, t2, r) => (_visibilitymap_pin = Module._visibilitymap_pin = wasmExports.visibilitymap_pin)(e, t2, r), _HeapTupleSatisfiesUpdate = Module._HeapTupleSatisfiesUpdate = (e, t2, r) => (_HeapTupleSatisfiesUpdate = Module._HeapTupleSatisfiesUpdate = wasmExports.HeapTupleSatisfiesUpdate)(e, t2, r), _TransactionIdIsCurrentTransactionId = Module._TransactionIdIsCurrentTransactionId = (e) => (_TransactionIdIsCurrentTransactionId = Module._TransactionIdIsCurrentTransactionId = wasmExports.TransactionIdIsCurrentTransactionId)(e), _TransactionIdDidCommit = Module._TransactionIdDidCommit = (e) => (_TransactionIdDidCommit = Module._TransactionIdDidCommit = wasmExports.TransactionIdDidCommit)(e), _TransactionIdIsInProgress = Module._TransactionIdIsInProgress = (e) => (_TransactionIdIsInProgress = Module._TransactionIdIsInProgress = wasmExports.TransactionIdIsInProgress)(e), _bms_free = Module._bms_free = (e) => (_bms_free = Module._bms_free = wasmExports.bms_free)(e), _bms_add_members = Module._bms_add_members = (e, t2) => (_bms_add_members = Module._bms_add_members = wasmExports.bms_add_members)(e, t2), _bms_next_member = Module._bms_next_member = (e, t2) => (_bms_next_member = Module._bms_next_member = wasmExports.bms_next_member)(e, t2), _bms_overlap = Module._bms_overlap = (e, t2) => (_bms_overlap = Module._bms_overlap = wasmExports.bms_overlap)(e, t2), _MultiXactIdPrecedes = Module._MultiXactIdPrecedes = (e, t2) => (_MultiXactIdPrecedes = Module._MultiXactIdPrecedes = wasmExports.MultiXactIdPrecedes)(e, t2), _heap_tuple_needs_eventual_freeze = Module._heap_tuple_needs_eventual_freeze = (e) => (_heap_tuple_needs_eventual_freeze = Module._heap_tuple_needs_eventual_freeze = wasmExports.heap_tuple_needs_eventual_freeze)(e), _PrefetchBuffer = Module._PrefetchBuffer = (e, t2, r, a2) => (_PrefetchBuffer = Module._PrefetchBuffer = wasmExports.PrefetchBuffer)(e, t2, r, a2), _XLogRecGetBlockTagExtended = Module._XLogRecGetBlockTagExtended = (e, t2, r, a2, o4, s4) => (_XLogRecGetBlockTagExtended = Module._XLogRecGetBlockTagExtended = wasmExports.XLogRecGetBlockTagExtended)(e, t2, r, a2, o4, s4), _read_stream_next_buffer = Module._read_stream_next_buffer = (e, t2) => (_read_stream_next_buffer = Module._read_stream_next_buffer = wasmExports.read_stream_next_buffer)(e, t2), _smgrexists = Module._smgrexists = (e, t2) => (_smgrexists = Module._smgrexists = wasmExports.smgrexists)(e, t2), _table_slot_create = Module._table_slot_create = (e, t2) => (_table_slot_create = Module._table_slot_create = wasmExports.table_slot_create)(e, t2), _ExecDropSingleTupleTableSlot = Module._ExecDropSingleTupleTableSlot = (e) => (_ExecDropSingleTupleTableSlot = Module._ExecDropSingleTupleTableSlot = wasmExports.ExecDropSingleTupleTableSlot)(e), _CreateExecutorState = Module._CreateExecutorState = () => (_CreateExecutorState = Module._CreateExecutorState = wasmExports.CreateExecutorState)(), _MakePerTupleExprContext = Module._MakePerTupleExprContext = (e) => (_MakePerTupleExprContext = Module._MakePerTupleExprContext = wasmExports.MakePerTupleExprContext)(e), _GetOldestNonRemovableTransactionId = Module._GetOldestNonRemovableTransactionId = (e) => (_GetOldestNonRemovableTransactionId = Module._GetOldestNonRemovableTransactionId = wasmExports.GetOldestNonRemovableTransactionId)(e), _FreeExecutorState = Module._FreeExecutorState = (e) => (_FreeExecutorState = Module._FreeExecutorState = wasmExports.FreeExecutorState)(e), _MakeSingleTupleTableSlot = Module._MakeSingleTupleTableSlot = (e, t2) => (_MakeSingleTupleTableSlot = Module._MakeSingleTupleTableSlot = wasmExports.MakeSingleTupleTableSlot)(e, t2), _ExecStoreHeapTuple = Module._ExecStoreHeapTuple = (e, t2, r) => (_ExecStoreHeapTuple = Module._ExecStoreHeapTuple = wasmExports.ExecStoreHeapTuple)(e, t2, r), _visibilitymap_get_status = Module._visibilitymap_get_status = (e, t2, r) => (_visibilitymap_get_status = Module._visibilitymap_get_status = wasmExports.visibilitymap_get_status)(e, t2, r), _ExecStoreAllNullTuple = Module._ExecStoreAllNullTuple = (e) => (_ExecStoreAllNullTuple = Module._ExecStoreAllNullTuple = wasmExports.ExecStoreAllNullTuple)(e), _XidInMVCCSnapshot = Module._XidInMVCCSnapshot = (e, t2) => (_XidInMVCCSnapshot = Module._XidInMVCCSnapshot = wasmExports.XidInMVCCSnapshot)(e, t2), _hash_seq_init = Module._hash_seq_init = (e, t2) => (_hash_seq_init = Module._hash_seq_init = wasmExports.hash_seq_init)(e, t2), _hash_seq_search = Module._hash_seq_search = (e) => (_hash_seq_search = Module._hash_seq_search = wasmExports.hash_seq_search)(e), _ftruncate = Module._ftruncate = (e, t2) => (_ftruncate = Module._ftruncate = wasmExports.ftruncate)(e, t2), _fd_fsync_fname = Module._fd_fsync_fname = (e, t2) => (_fd_fsync_fname = Module._fd_fsync_fname = wasmExports.fd_fsync_fname)(e, t2), _get_namespace_name = Module._get_namespace_name = (e) => (_get_namespace_name = Module._get_namespace_name = wasmExports.get_namespace_name)(e), _GetRecordedFreeSpace = Module._GetRecordedFreeSpace = (e, t2) => (_GetRecordedFreeSpace = Module._GetRecordedFreeSpace = wasmExports.GetRecordedFreeSpace)(e, t2), _vac_estimate_reltuples = Module._vac_estimate_reltuples = (e, t2, r, a2) => (_vac_estimate_reltuples = Module._vac_estimate_reltuples = wasmExports.vac_estimate_reltuples)(e, t2, r, a2), _WaitLatch = Module._WaitLatch = (e, t2, r, a2) => (_WaitLatch = Module._WaitLatch = wasmExports.WaitLatch)(e, t2, r, a2), _ResetLatch = Module._ResetLatch = (e) => (_ResetLatch = Module._ResetLatch = wasmExports.ResetLatch)(e), _clock_gettime = Module._clock_gettime = (e, t2) => (_clock_gettime = Module._clock_gettime = wasmExports.clock_gettime)(e, t2), _WalUsageAccumDiff = Module._WalUsageAccumDiff = (e, t2, r) => (_WalUsageAccumDiff = Module._WalUsageAccumDiff = wasmExports.WalUsageAccumDiff)(e, t2, r), _BufferUsageAccumDiff = Module._BufferUsageAccumDiff = (e, t2, r) => (_BufferUsageAccumDiff = Module._BufferUsageAccumDiff = wasmExports.BufferUsageAccumDiff)(e, t2, r), _visibilitymap_prepare_truncate = Module._visibilitymap_prepare_truncate = (e, t2) => (_visibilitymap_prepare_truncate = Module._visibilitymap_prepare_truncate = wasmExports.visibilitymap_prepare_truncate)(e, t2), _pg_class_aclcheck = Module._pg_class_aclcheck = (e, t2, r) => (_pg_class_aclcheck = Module._pg_class_aclcheck = wasmExports.pg_class_aclcheck)(e, t2, r), _btboolcmp = Module._btboolcmp = (e) => (_btboolcmp = Module._btboolcmp = wasmExports.btboolcmp)(e), _btint2cmp = Module._btint2cmp = (e) => (_btint2cmp = Module._btint2cmp = wasmExports.btint2cmp)(e), _btint4cmp = Module._btint4cmp = (e) => (_btint4cmp = Module._btint4cmp = wasmExports.btint4cmp)(e), _btint8cmp = Module._btint8cmp = (e) => (_btint8cmp = Module._btint8cmp = wasmExports.btint8cmp)(e), _btoidcmp = Module._btoidcmp = (e) => (_btoidcmp = Module._btoidcmp = wasmExports.btoidcmp)(e), _btcharcmp = Module._btcharcmp = (e) => (_btcharcmp = Module._btcharcmp = wasmExports.btcharcmp)(e), __bt_form_posting = Module.__bt_form_posting = (e, t2, r) => (__bt_form_posting = Module.__bt_form_posting = wasmExports._bt_form_posting)(e, t2, r), __bt_mkscankey = Module.__bt_mkscankey = (e, t2) => (__bt_mkscankey = Module.__bt_mkscankey = wasmExports._bt_mkscankey)(e, t2), __bt_checkpage = Module.__bt_checkpage = (e, t2) => (__bt_checkpage = Module.__bt_checkpage = wasmExports._bt_checkpage)(e, t2), __bt_compare = Module.__bt_compare = (e, t2, r, a2) => (__bt_compare = Module.__bt_compare = wasmExports._bt_compare)(e, t2, r, a2), __bt_relbuf = Module.__bt_relbuf = (e, t2) => (__bt_relbuf = Module.__bt_relbuf = wasmExports._bt_relbuf)(e, t2), __bt_search = Module.__bt_search = (e, t2, r, a2, o4) => (__bt_search = Module.__bt_search = wasmExports._bt_search)(e, t2, r, a2, o4), __bt_binsrch_insert = Module.__bt_binsrch_insert = (e, t2) => (__bt_binsrch_insert = Module.__bt_binsrch_insert = wasmExports._bt_binsrch_insert)(e, t2), __bt_freestack = Module.__bt_freestack = (e) => (__bt_freestack = Module.__bt_freestack = wasmExports._bt_freestack)(e), __bt_metaversion = Module.__bt_metaversion = (e, t2, r) => (__bt_metaversion = Module.__bt_metaversion = wasmExports._bt_metaversion)(e, t2, r), __bt_allequalimage = Module.__bt_allequalimage = (e, t2) => (__bt_allequalimage = Module.__bt_allequalimage = wasmExports._bt_allequalimage)(e, t2), _before_shmem_exit = Module._before_shmem_exit = (e, t2) => (_before_shmem_exit = Module._before_shmem_exit = wasmExports.before_shmem_exit)(e, t2), _cancel_before_shmem_exit = Module._cancel_before_shmem_exit = (e, t2) => (_cancel_before_shmem_exit = Module._cancel_before_shmem_exit = wasmExports.cancel_before_shmem_exit)(e, t2), _pg_re_throw = Module._pg_re_throw = () => (_pg_re_throw = Module._pg_re_throw = wasmExports.pg_re_throw)(), _get_opfamily_member = Module._get_opfamily_member = (e, t2, r, a2) => (_get_opfamily_member = Module._get_opfamily_member = wasmExports.get_opfamily_member)(e, t2, r, a2), __bt_check_natts = Module.__bt_check_natts = (e, t2, r, a2) => (__bt_check_natts = Module.__bt_check_natts = wasmExports._bt_check_natts)(e, t2, r, a2), _strncpy = Module._strncpy = (e, t2, r) => (_strncpy = Module._strncpy = wasmExports.strncpy)(e, t2, r), _timestamptz_to_str = Module._timestamptz_to_str = (e) => (_timestamptz_to_str = Module._timestamptz_to_str = wasmExports.timestamptz_to_str)(e), _XLogRecGetBlockRefInfo = Module._XLogRecGetBlockRefInfo = (e, t2, r, a2, o4) => (_XLogRecGetBlockRefInfo = Module._XLogRecGetBlockRefInfo = wasmExports.XLogRecGetBlockRefInfo)(e, t2, r, a2, o4), _varstr_cmp = Module._varstr_cmp = (e, t2, r, a2, o4) => (_varstr_cmp = Module._varstr_cmp = wasmExports.varstr_cmp)(e, t2, r, a2, o4), _exprType = Module._exprType = (e) => (_exprType = Module._exprType = wasmExports.exprType)(e), _GetActiveSnapshot = Module._GetActiveSnapshot = () => (_GetActiveSnapshot = Module._GetActiveSnapshot = wasmExports.GetActiveSnapshot)(), _errdetail_relkind_not_supported = Module._errdetail_relkind_not_supported = (e) => (_errdetail_relkind_not_supported = Module._errdetail_relkind_not_supported = wasmExports.errdetail_relkind_not_supported)(e), _table_openrv = Module._table_openrv = (e, t2) => (_table_openrv = Module._table_openrv = wasmExports.table_openrv)(e, t2), _table_slot_callbacks = Module._table_slot_callbacks = (e) => (_table_slot_callbacks = Module._table_slot_callbacks = wasmExports.table_slot_callbacks)(e), _clamp_row_est = Module._clamp_row_est = (e) => (_clamp_row_est = Module._clamp_row_est = wasmExports.clamp_row_est)(e), _estimate_expression_value = Module._estimate_expression_value = (e, t2) => (_estimate_expression_value = Module._estimate_expression_value = wasmExports.estimate_expression_value)(e, t2), _XLogFlush = Module._XLogFlush = (e) => (_XLogFlush = Module._XLogFlush = wasmExports.XLogFlush)(e), _get_call_result_type = Module._get_call_result_type = (e, t2, r) => (_get_call_result_type = Module._get_call_result_type = wasmExports.get_call_result_type)(e, t2, r), _HeapTupleHeaderGetDatum = Module._HeapTupleHeaderGetDatum = (e) => (_HeapTupleHeaderGetDatum = Module._HeapTupleHeaderGetDatum = wasmExports.HeapTupleHeaderGetDatum)(e), _GenericXLogStart = Module._GenericXLogStart = (e) => (_GenericXLogStart = Module._GenericXLogStart = wasmExports.GenericXLogStart)(e), _GenericXLogRegisterBuffer = Module._GenericXLogRegisterBuffer = (e, t2, r) => (_GenericXLogRegisterBuffer = Module._GenericXLogRegisterBuffer = wasmExports.GenericXLogRegisterBuffer)(e, t2, r), _GenericXLogFinish = Module._GenericXLogFinish = (e) => (_GenericXLogFinish = Module._GenericXLogFinish = wasmExports.GenericXLogFinish)(e), _GenericXLogAbort = Module._GenericXLogAbort = (e) => (_GenericXLogAbort = Module._GenericXLogAbort = wasmExports.GenericXLogAbort)(e), _errmsg_plural = Module._errmsg_plural = (e, t2, r, a2) => (_errmsg_plural = Module._errmsg_plural = wasmExports.errmsg_plural)(e, t2, r, a2), _ReadNextMultiXactId = Module._ReadNextMultiXactId = () => (_ReadNextMultiXactId = Module._ReadNextMultiXactId = wasmExports.ReadNextMultiXactId)(), _ReadMultiXactIdRange = Module._ReadMultiXactIdRange = (e, t2) => (_ReadMultiXactIdRange = Module._ReadMultiXactIdRange = wasmExports.ReadMultiXactIdRange)(e, t2), _MultiXactIdPrecedesOrEquals = Module._MultiXactIdPrecedesOrEquals = (e, t2) => (_MultiXactIdPrecedesOrEquals = Module._MultiXactIdPrecedesOrEquals = wasmExports.MultiXactIdPrecedesOrEquals)(e, t2), _init_MultiFuncCall = Module._init_MultiFuncCall = (e) => (_init_MultiFuncCall = Module._init_MultiFuncCall = wasmExports.init_MultiFuncCall)(e), _TupleDescGetAttInMetadata = Module._TupleDescGetAttInMetadata = (e) => (_TupleDescGetAttInMetadata = Module._TupleDescGetAttInMetadata = wasmExports.TupleDescGetAttInMetadata)(e), _per_MultiFuncCall = Module._per_MultiFuncCall = (e) => (_per_MultiFuncCall = Module._per_MultiFuncCall = wasmExports.per_MultiFuncCall)(e), _BuildTupleFromCStrings = Module._BuildTupleFromCStrings = (e, t2) => (_BuildTupleFromCStrings = Module._BuildTupleFromCStrings = wasmExports.BuildTupleFromCStrings)(e, t2), _end_MultiFuncCall = Module._end_MultiFuncCall = (e, t2) => (_end_MultiFuncCall = Module._end_MultiFuncCall = wasmExports.end_MultiFuncCall)(e, t2), _GetCurrentSubTransactionId = Module._GetCurrentSubTransactionId = () => (_GetCurrentSubTransactionId = Module._GetCurrentSubTransactionId = wasmExports.GetCurrentSubTransactionId)(), _WaitForBackgroundWorkerShutdown = Module._WaitForBackgroundWorkerShutdown = (e) => (_WaitForBackgroundWorkerShutdown = Module._WaitForBackgroundWorkerShutdown = wasmExports.WaitForBackgroundWorkerShutdown)(e), _RegisterDynamicBackgroundWorker = Module._RegisterDynamicBackgroundWorker = (e, t2) => (_RegisterDynamicBackgroundWorker = Module._RegisterDynamicBackgroundWorker = wasmExports.RegisterDynamicBackgroundWorker)(e, t2), _BackgroundWorkerUnblockSignals = Module._BackgroundWorkerUnblockSignals = () => (_BackgroundWorkerUnblockSignals = Module._BackgroundWorkerUnblockSignals = wasmExports.BackgroundWorkerUnblockSignals)(), _BackgroundWorkerInitializeConnectionByOid = Module._BackgroundWorkerInitializeConnectionByOid = (e, t2, r) => (_BackgroundWorkerInitializeConnectionByOid = Module._BackgroundWorkerInitializeConnectionByOid = wasmExports.BackgroundWorkerInitializeConnectionByOid)(e, t2, r), _GetDatabaseEncoding = Module._GetDatabaseEncoding = () => (_GetDatabaseEncoding = Module._GetDatabaseEncoding = wasmExports.GetDatabaseEncoding)(), _RmgrNotFound = Module._RmgrNotFound = (e) => (_RmgrNotFound = Module._RmgrNotFound = wasmExports.RmgrNotFound)(e), _InitMaterializedSRF = Module._InitMaterializedSRF = (e, t2) => (_InitMaterializedSRF = Module._InitMaterializedSRF = wasmExports.InitMaterializedSRF)(e, t2), _tuplestore_putvalues = Module._tuplestore_putvalues = (e, t2, r, a2) => (_tuplestore_putvalues = Module._tuplestore_putvalues = wasmExports.tuplestore_putvalues)(e, t2, r, a2), _AllocateFile = Module._AllocateFile = (e, t2) => (_AllocateFile = Module._AllocateFile = wasmExports.AllocateFile)(e, t2), _FreeFile = Module._FreeFile = (e) => (_FreeFile = Module._FreeFile = wasmExports.FreeFile)(e), _fd_durable_rename = Module._fd_durable_rename = (e, t2, r) => (_fd_durable_rename = Module._fd_durable_rename = wasmExports.fd_durable_rename)(e, t2, r), _BlessTupleDesc = Module._BlessTupleDesc = (e) => (_BlessTupleDesc = Module._BlessTupleDesc = wasmExports.BlessTupleDesc)(e), _fstat = Module._fstat = (e, t2) => (_fstat = Module._fstat = wasmExports.fstat)(e, t2), _superuser_arg = Module._superuser_arg = (e) => (_superuser_arg = Module._superuser_arg = wasmExports.superuser_arg)(e), _wal_segment_close = Module._wal_segment_close = (e) => (_wal_segment_close = Module._wal_segment_close = wasmExports.wal_segment_close)(e), _wal_segment_open = Module._wal_segment_open = (e, t2, r) => (_wal_segment_open = Module._wal_segment_open = wasmExports.wal_segment_open)(e, t2, r), _XLogReaderAllocate = Module._XLogReaderAllocate = (e, t2, r, a2) => (_XLogReaderAllocate = Module._XLogReaderAllocate = wasmExports.XLogReaderAllocate)(e, t2, r, a2), _XLogReadRecord = Module._XLogReadRecord = (e, t2) => (_XLogReadRecord = Module._XLogReadRecord = wasmExports.XLogReadRecord)(e, t2), _XLogReaderFree = Module._XLogReaderFree = (e) => (_XLogReaderFree = Module._XLogReaderFree = wasmExports.XLogReaderFree)(e), _GetTopFullTransactionId = Module._GetTopFullTransactionId = () => (_GetTopFullTransactionId = Module._GetTopFullTransactionId = wasmExports.GetTopFullTransactionId)(), _GetCurrentTransactionNestLevel = Module._GetCurrentTransactionNestLevel = () => (_GetCurrentTransactionNestLevel = Module._GetCurrentTransactionNestLevel = wasmExports.GetCurrentTransactionNestLevel)(), _ResourceOwnerCreate = Module._ResourceOwnerCreate = (e, t2) => (_ResourceOwnerCreate = Module._ResourceOwnerCreate = wasmExports.ResourceOwnerCreate)(e, t2), _RegisterXactCallback = Module._RegisterXactCallback = (e, t2) => (_RegisterXactCallback = Module._RegisterXactCallback = wasmExports.RegisterXactCallback)(e, t2), _RegisterSubXactCallback = Module._RegisterSubXactCallback = (e, t2) => (_RegisterSubXactCallback = Module._RegisterSubXactCallback = wasmExports.RegisterSubXactCallback)(e, t2), _BeginInternalSubTransaction = Module._BeginInternalSubTransaction = (e) => (_BeginInternalSubTransaction = Module._BeginInternalSubTransaction = wasmExports.BeginInternalSubTransaction)(e), _ReleaseCurrentSubTransaction = Module._ReleaseCurrentSubTransaction = () => (_ReleaseCurrentSubTransaction = Module._ReleaseCurrentSubTransaction = wasmExports.ReleaseCurrentSubTransaction)(), _ResourceOwnerDelete = Module._ResourceOwnerDelete = (e) => (_ResourceOwnerDelete = Module._ResourceOwnerDelete = wasmExports.ResourceOwnerDelete)(e), _RollbackAndReleaseCurrentSubTransaction = Module._RollbackAndReleaseCurrentSubTransaction = () => (_RollbackAndReleaseCurrentSubTransaction = Module._RollbackAndReleaseCurrentSubTransaction = wasmExports.RollbackAndReleaseCurrentSubTransaction)(), _ReleaseExternalFD = Module._ReleaseExternalFD = () => (_ReleaseExternalFD = Module._ReleaseExternalFD = wasmExports.ReleaseExternalFD)(), _GetFlushRecPtr = Module._GetFlushRecPtr = (e) => (_GetFlushRecPtr = Module._GetFlushRecPtr = wasmExports.GetFlushRecPtr)(e), _GetXLogReplayRecPtr = Module._GetXLogReplayRecPtr = (e) => (_GetXLogReplayRecPtr = Module._GetXLogReplayRecPtr = wasmExports.GetXLogReplayRecPtr)(e), _TimestampDifferenceMilliseconds = Module._TimestampDifferenceMilliseconds = (e, t2) => (_TimestampDifferenceMilliseconds = Module._TimestampDifferenceMilliseconds = wasmExports.TimestampDifferenceMilliseconds)(e, t2), _numeric_in = Module._numeric_in = (e) => (_numeric_in = Module._numeric_in = wasmExports.numeric_in)(e), _DirectFunctionCall3Coll = Module._DirectFunctionCall3Coll = (e, t2, r, a2, o4) => (_DirectFunctionCall3Coll = Module._DirectFunctionCall3Coll = wasmExports.DirectFunctionCall3Coll)(e, t2, r, a2, o4), _XLogFindNextRecord = Module._XLogFindNextRecord = (e, t2) => (_XLogFindNextRecord = Module._XLogFindNextRecord = wasmExports.XLogFindNextRecord)(e, t2), _RestoreBlockImage = Module._RestoreBlockImage = (e, t2, r) => (_RestoreBlockImage = Module._RestoreBlockImage = wasmExports.RestoreBlockImage)(e, t2, r), _timestamptz_in = Module._timestamptz_in = (e) => (_timestamptz_in = Module._timestamptz_in = wasmExports.timestamptz_in)(e), _fscanf = Module._fscanf = (e, t2, r) => (_fscanf = Module._fscanf = wasmExports.fscanf)(e, t2, r), _XLogRecStoreStats = Module._XLogRecStoreStats = (e, t2) => (_XLogRecStoreStats = Module._XLogRecStoreStats = wasmExports.XLogRecStoreStats)(e, t2), _hash_get_num_entries = Module._hash_get_num_entries = (e) => (_hash_get_num_entries = Module._hash_get_num_entries = wasmExports.hash_get_num_entries)(e), _read_local_xlog_page_no_wait = Module._read_local_xlog_page_no_wait = (e, t2, r, a2, o4) => (_read_local_xlog_page_no_wait = Module._read_local_xlog_page_no_wait = wasmExports.read_local_xlog_page_no_wait)(e, t2, r, a2, o4), _escape_json = Module._escape_json = (e, t2) => (_escape_json = Module._escape_json = wasmExports.escape_json)(e, t2), _list_sort = Module._list_sort = (e, t2) => (_list_sort = Module._list_sort = wasmExports.list_sort)(e, t2), _getegid = Module._getegid = () => (_getegid = Module._getegid = wasmExports.getegid)(), _pg_checksum_page = Module._pg_checksum_page = (e, t2) => (_pg_checksum_page = Module._pg_checksum_page = wasmExports.pg_checksum_page)(e, t2), _bbsink_forward_end_archive = Module._bbsink_forward_end_archive = (e) => (_bbsink_forward_end_archive = Module._bbsink_forward_end_archive = wasmExports.bbsink_forward_end_archive)(e), _bbsink_forward_begin_manifest = Module._bbsink_forward_begin_manifest = (e) => (_bbsink_forward_begin_manifest = Module._bbsink_forward_begin_manifest = wasmExports.bbsink_forward_begin_manifest)(e), _bbsink_forward_end_manifest = Module._bbsink_forward_end_manifest = (e) => (_bbsink_forward_end_manifest = Module._bbsink_forward_end_manifest = wasmExports.bbsink_forward_end_manifest)(e), _bbsink_forward_end_backup = Module._bbsink_forward_end_backup = (e, t2, r) => (_bbsink_forward_end_backup = Module._bbsink_forward_end_backup = wasmExports.bbsink_forward_end_backup)(e, t2, r), _bbsink_forward_cleanup = Module._bbsink_forward_cleanup = (e) => (_bbsink_forward_cleanup = Module._bbsink_forward_cleanup = wasmExports.bbsink_forward_cleanup)(e), _list_concat = Module._list_concat = (e, t2) => (_list_concat = Module._list_concat = wasmExports.list_concat)(e, t2), _bbsink_forward_begin_backup = Module._bbsink_forward_begin_backup = (e) => (_bbsink_forward_begin_backup = Module._bbsink_forward_begin_backup = wasmExports.bbsink_forward_begin_backup)(e), _bbsink_forward_archive_contents = Module._bbsink_forward_archive_contents = (e, t2) => (_bbsink_forward_archive_contents = Module._bbsink_forward_archive_contents = wasmExports.bbsink_forward_archive_contents)(e, t2), _bbsink_forward_begin_archive = Module._bbsink_forward_begin_archive = (e, t2) => (_bbsink_forward_begin_archive = Module._bbsink_forward_begin_archive = wasmExports.bbsink_forward_begin_archive)(e, t2), _bbsink_forward_manifest_contents = Module._bbsink_forward_manifest_contents = (e, t2) => (_bbsink_forward_manifest_contents = Module._bbsink_forward_manifest_contents = wasmExports.bbsink_forward_manifest_contents)(e, t2), _has_privs_of_role = Module._has_privs_of_role = (e, t2) => (_has_privs_of_role = Module._has_privs_of_role = wasmExports.has_privs_of_role)(e, t2), _BaseBackupAddTarget = Module._BaseBackupAddTarget = (e, t2, r) => (_BaseBackupAddTarget = Module._BaseBackupAddTarget = wasmExports.BaseBackupAddTarget)(e, t2, r), _list_copy = Module._list_copy = (e) => (_list_copy = Module._list_copy = wasmExports.list_copy)(e), _tuplestore_puttuple = Module._tuplestore_puttuple = (e, t2) => (_tuplestore_puttuple = Module._tuplestore_puttuple = wasmExports.tuplestore_puttuple)(e, t2), _makeRangeVar = Module._makeRangeVar = (e, t2, r) => (_makeRangeVar = Module._makeRangeVar = wasmExports.makeRangeVar)(e, t2, r), _DefineIndex = Module._DefineIndex = (e, t2, r, a2, o4, s4, n3, _3, l3, p4, m4, d2) => (_DefineIndex = Module._DefineIndex = wasmExports.DefineIndex)(e, t2, r, a2, o4, s4, n3, _3, l3, p4, m4, d2), _fread = Module._fread = (e, t2, r, a2) => (_fread = Module._fread = wasmExports.fread)(e, t2, r, a2), _clearerr = Module._clearerr = (e) => (_clearerr = Module._clearerr = wasmExports.clearerr)(e), _copyObjectImpl = Module._copyObjectImpl = (e) => (_copyObjectImpl = Module._copyObjectImpl = wasmExports.copyObjectImpl)(e), _lappend_oid = Module._lappend_oid = (e, t2) => (_lappend_oid = Module._lappend_oid = wasmExports.lappend_oid)(e, t2), _makeTypeNameFromNameList = Module._makeTypeNameFromNameList = (e) => (_makeTypeNameFromNameList = Module._makeTypeNameFromNameList = wasmExports.makeTypeNameFromNameList)(e), _CatalogTupleUpdate = Module._CatalogTupleUpdate = (e, t2, r) => (_CatalogTupleUpdate = Module._CatalogTupleUpdate = wasmExports.CatalogTupleUpdate)(e, t2, r), _get_rel_name = Module._get_rel_name = (e) => (_get_rel_name = Module._get_rel_name = wasmExports.get_rel_name)(e), _CatalogTupleDelete = Module._CatalogTupleDelete = (e, t2) => (_CatalogTupleDelete = Module._CatalogTupleDelete = wasmExports.CatalogTupleDelete)(e, t2), _CatalogTupleInsert = Module._CatalogTupleInsert = (e, t2) => (_CatalogTupleInsert = Module._CatalogTupleInsert = wasmExports.CatalogTupleInsert)(e, t2), _recordDependencyOn = Module._recordDependencyOn = (e, t2, r) => (_recordDependencyOn = Module._recordDependencyOn = wasmExports.recordDependencyOn)(e, t2, r), _get_element_type = Module._get_element_type = (e) => (_get_element_type = Module._get_element_type = wasmExports.get_element_type)(e), _object_aclcheck = Module._object_aclcheck = (e, t2, r, a2) => (_object_aclcheck = Module._object_aclcheck = wasmExports.object_aclcheck)(e, t2, r, a2), _superuser = Module._superuser = () => (_superuser = Module._superuser = wasmExports.superuser)(), _SearchSysCacheAttName = Module._SearchSysCacheAttName = (e, t2) => (_SearchSysCacheAttName = Module._SearchSysCacheAttName = wasmExports.SearchSysCacheAttName)(e, t2), _new_object_addresses = Module._new_object_addresses = () => (_new_object_addresses = Module._new_object_addresses = wasmExports.new_object_addresses)(), _free_object_addresses = Module._free_object_addresses = (e) => (_free_object_addresses = Module._free_object_addresses = wasmExports.free_object_addresses)(e), _performMultipleDeletions = Module._performMultipleDeletions = (e, t2, r) => (_performMultipleDeletions = Module._performMultipleDeletions = wasmExports.performMultipleDeletions)(e, t2, r), _recordDependencyOnExpr = Module._recordDependencyOnExpr = (e, t2, r, a2) => (_recordDependencyOnExpr = Module._recordDependencyOnExpr = wasmExports.recordDependencyOnExpr)(e, t2, r, a2), _query_tree_walker_impl = Module._query_tree_walker_impl = (e, t2, r, a2) => (_query_tree_walker_impl = Module._query_tree_walker_impl = wasmExports.query_tree_walker_impl)(e, t2, r, a2), _expression_tree_walker_impl = Module._expression_tree_walker_impl = (e, t2, r) => (_expression_tree_walker_impl = Module._expression_tree_walker_impl = wasmExports.expression_tree_walker_impl)(e, t2, r), _add_exact_object_address = Module._add_exact_object_address = (e, t2) => (_add_exact_object_address = Module._add_exact_object_address = wasmExports.add_exact_object_address)(e, t2), _get_rel_relkind = Module._get_rel_relkind = (e) => (_get_rel_relkind = Module._get_rel_relkind = wasmExports.get_rel_relkind)(e), _get_typtype = Module._get_typtype = (e) => (_get_typtype = Module._get_typtype = wasmExports.get_typtype)(e), _list_delete_last = Module._list_delete_last = (e) => (_list_delete_last = Module._list_delete_last = wasmExports.list_delete_last)(e), _type_is_collatable = Module._type_is_collatable = (e) => (_type_is_collatable = Module._type_is_collatable = wasmExports.type_is_collatable)(e), _GetSysCacheOid = Module._GetSysCacheOid = (e, t2, r, a2, o4, s4) => (_GetSysCacheOid = Module._GetSysCacheOid = wasmExports.GetSysCacheOid)(e, t2, r, a2, o4, s4), _CheckTableNotInUse = Module._CheckTableNotInUse = (e, t2) => (_CheckTableNotInUse = Module._CheckTableNotInUse = wasmExports.CheckTableNotInUse)(e, t2), _construct_array = Module._construct_array = (e, t2, r, a2, o4, s4) => (_construct_array = Module._construct_array = wasmExports.construct_array)(e, t2, r, a2, o4, s4), _make_parsestate = Module._make_parsestate = (e) => (_make_parsestate = Module._make_parsestate = wasmExports.make_parsestate)(e), _transformExpr = Module._transformExpr = (e, t2, r) => (_transformExpr = Module._transformExpr = wasmExports.transformExpr)(e, t2, r), _equal = Module._equal = (e, t2) => (_equal = Module._equal = wasmExports.equal)(e, t2), _pull_var_clause = Module._pull_var_clause = (e, t2) => (_pull_var_clause = Module._pull_var_clause = wasmExports.pull_var_clause)(e, t2), _get_attname = Module._get_attname = (e, t2, r) => (_get_attname = Module._get_attname = wasmExports.get_attname)(e, t2, r), _coerce_to_target_type = Module._coerce_to_target_type = (e, t2, r, a2, o4, s4, n3, _3) => (_coerce_to_target_type = Module._coerce_to_target_type = wasmExports.coerce_to_target_type)(e, t2, r, a2, o4, s4, n3, _3), _nodeToString = Module._nodeToString = (e) => (_nodeToString = Module._nodeToString = wasmExports.nodeToString)(e), _parser_errposition = Module._parser_errposition = (e, t2) => (_parser_errposition = Module._parser_errposition = wasmExports.parser_errposition)(e, t2), _exprTypmod = Module._exprTypmod = (e) => (_exprTypmod = Module._exprTypmod = wasmExports.exprTypmod)(e), _get_base_element_type = Module._get_base_element_type = (e) => (_get_base_element_type = Module._get_base_element_type = wasmExports.get_base_element_type)(e), _SystemFuncName = Module._SystemFuncName = (e) => (_SystemFuncName = Module._SystemFuncName = wasmExports.SystemFuncName)(e), _CreateTrigger = Module._CreateTrigger = (e, t2, r, a2, o4, s4, n3, _3, l3, p4, m4, d2) => (_CreateTrigger = Module._CreateTrigger = wasmExports.CreateTrigger)(e, t2, r, a2, o4, s4, n3, _3, l3, p4, m4, d2), _plan_create_index_workers = Module._plan_create_index_workers = (e, t2) => (_plan_create_index_workers = Module._plan_create_index_workers = wasmExports.plan_create_index_workers)(e, t2), _get_rel_namespace = Module._get_rel_namespace = (e) => (_get_rel_namespace = Module._get_rel_namespace = wasmExports.get_rel_namespace)(e), _ConditionalLockRelationOid = Module._ConditionalLockRelationOid = (e, t2) => (_ConditionalLockRelationOid = Module._ConditionalLockRelationOid = wasmExports.ConditionalLockRelationOid)(e, t2), _RelnameGetRelid = Module._RelnameGetRelid = (e) => (_RelnameGetRelid = Module._RelnameGetRelid = wasmExports.RelnameGetRelid)(e), _get_relkind_objtype = Module._get_relkind_objtype = (e) => (_get_relkind_objtype = Module._get_relkind_objtype = wasmExports.get_relkind_objtype)(e), _RelationIsVisible = Module._RelationIsVisible = (e) => (_RelationIsVisible = Module._RelationIsVisible = wasmExports.RelationIsVisible)(e), _get_func_arg_info = Module._get_func_arg_info = (e, t2, r, a2) => (_get_func_arg_info = Module._get_func_arg_info = wasmExports.get_func_arg_info)(e, t2, r, a2), _NameListToString = Module._NameListToString = (e) => (_NameListToString = Module._NameListToString = wasmExports.NameListToString)(e), _OpernameGetOprid = Module._OpernameGetOprid = (e, t2, r) => (_OpernameGetOprid = Module._OpernameGetOprid = wasmExports.OpernameGetOprid)(e, t2, r), _makeRangeVarFromNameList = Module._makeRangeVarFromNameList = (e) => (_makeRangeVarFromNameList = Module._makeRangeVarFromNameList = wasmExports.makeRangeVarFromNameList)(e), _quote_identifier = Module._quote_identifier = (e) => (_quote_identifier = Module._quote_identifier = wasmExports.quote_identifier)(e), _GetSearchPathMatcher = Module._GetSearchPathMatcher = (e) => (_GetSearchPathMatcher = Module._GetSearchPathMatcher = wasmExports.GetSearchPathMatcher)(e), _SearchPathMatchesCurrentEnvironment = Module._SearchPathMatchesCurrentEnvironment = (e) => (_SearchPathMatchesCurrentEnvironment = Module._SearchPathMatchesCurrentEnvironment = wasmExports.SearchPathMatchesCurrentEnvironment)(e), _get_collation_oid = Module._get_collation_oid = (e, t2) => (_get_collation_oid = Module._get_collation_oid = wasmExports.get_collation_oid)(e, t2), _CacheRegisterSyscacheCallback = Module._CacheRegisterSyscacheCallback = (e, t2, r) => (_CacheRegisterSyscacheCallback = Module._CacheRegisterSyscacheCallback = wasmExports.CacheRegisterSyscacheCallback)(e, t2, r), _get_extension_oid = Module._get_extension_oid = (e, t2) => (_get_extension_oid = Module._get_extension_oid = wasmExports.get_extension_oid)(e, t2), _get_role_oid = Module._get_role_oid = (e, t2) => (_get_role_oid = Module._get_role_oid = wasmExports.get_role_oid)(e, t2), _GetForeignServerByName = Module._GetForeignServerByName = (e, t2) => (_GetForeignServerByName = Module._GetForeignServerByName = wasmExports.GetForeignServerByName)(e, t2), _typeStringToTypeName = Module._typeStringToTypeName = (e, t2) => (_typeStringToTypeName = Module._typeStringToTypeName = wasmExports.typeStringToTypeName)(e, t2), _list_make2_impl = Module._list_make2_impl = (e, t2, r) => (_list_make2_impl = Module._list_make2_impl = wasmExports.list_make2_impl)(e, t2, r), _GetUserNameFromId = Module._GetUserNameFromId = (e, t2) => (_GetUserNameFromId = Module._GetUserNameFromId = wasmExports.GetUserNameFromId)(e, t2), _format_type_extended = Module._format_type_extended = (e, t2, r) => (_format_type_extended = Module._format_type_extended = wasmExports.format_type_extended)(e, t2, r), _quote_qualified_identifier = Module._quote_qualified_identifier = (e, t2) => (_quote_qualified_identifier = Module._quote_qualified_identifier = wasmExports.quote_qualified_identifier)(e, t2), _get_tablespace_name = Module._get_tablespace_name = (e) => (_get_tablespace_name = Module._get_tablespace_name = wasmExports.get_tablespace_name)(e), _GetForeignServerExtended = Module._GetForeignServerExtended = (e, t2) => (_GetForeignServerExtended = Module._GetForeignServerExtended = wasmExports.GetForeignServerExtended)(e, t2), _GetForeignServer = Module._GetForeignServer = (e) => (_GetForeignServer = Module._GetForeignServer = wasmExports.GetForeignServer)(e), _construct_empty_array = Module._construct_empty_array = (e) => (_construct_empty_array = Module._construct_empty_array = wasmExports.construct_empty_array)(e), _format_type_be_qualified = Module._format_type_be_qualified = (e) => (_format_type_be_qualified = Module._format_type_be_qualified = wasmExports.format_type_be_qualified)(e), _get_namespace_name_or_temp = Module._get_namespace_name_or_temp = (e) => (_get_namespace_name_or_temp = Module._get_namespace_name_or_temp = wasmExports.get_namespace_name_or_temp)(e), _list_make3_impl = Module._list_make3_impl = (e, t2, r, a2) => (_list_make3_impl = Module._list_make3_impl = wasmExports.list_make3_impl)(e, t2, r, a2), _construct_md_array = Module._construct_md_array = (e, t2, r, a2, o4, s4, n3, _3, l3) => (_construct_md_array = Module._construct_md_array = wasmExports.construct_md_array)(e, t2, r, a2, o4, s4, n3, _3, l3), _pull_varattnos = Module._pull_varattnos = (e, t2, r) => (_pull_varattnos = Module._pull_varattnos = wasmExports.pull_varattnos)(e, t2, r), _get_func_name = Module._get_func_name = (e) => (_get_func_name = Module._get_func_name = wasmExports.get_func_name)(e), _construct_array_builtin = Module._construct_array_builtin = (e, t2, r) => (_construct_array_builtin = Module._construct_array_builtin = wasmExports.construct_array_builtin)(e, t2, r), _makeObjectName = Module._makeObjectName = (e, t2, r) => (_makeObjectName = Module._makeObjectName = wasmExports.makeObjectName)(e, t2, r), _get_primary_key_attnos = Module._get_primary_key_attnos = (e, t2, r) => (_get_primary_key_attnos = Module._get_primary_key_attnos = wasmExports.get_primary_key_attnos)(e, t2, r), _bms_is_subset = Module._bms_is_subset = (e, t2) => (_bms_is_subset = Module._bms_is_subset = wasmExports.bms_is_subset)(e, t2), _getExtensionOfObject = Module._getExtensionOfObject = (e, t2) => (_getExtensionOfObject = Module._getExtensionOfObject = wasmExports.getExtensionOfObject)(e, t2), _find_inheritance_children = Module._find_inheritance_children = (e, t2) => (_find_inheritance_children = Module._find_inheritance_children = wasmExports.find_inheritance_children)(e, t2), _lappend_int = Module._lappend_int = (e, t2) => (_lappend_int = Module._lappend_int = wasmExports.lappend_int)(e, t2), _has_superclass = Module._has_superclass = (e) => (_has_superclass = Module._has_superclass = wasmExports.has_superclass)(e), _CheckFunctionValidatorAccess = Module._CheckFunctionValidatorAccess = (e, t2) => (_CheckFunctionValidatorAccess = Module._CheckFunctionValidatorAccess = wasmExports.CheckFunctionValidatorAccess)(e, t2), _AcquireRewriteLocks = Module._AcquireRewriteLocks = (e, t2, r) => (_AcquireRewriteLocks = Module._AcquireRewriteLocks = wasmExports.AcquireRewriteLocks)(e, t2, r), _function_parse_error_transpose = Module._function_parse_error_transpose = (e) => (_function_parse_error_transpose = Module._function_parse_error_transpose = wasmExports.function_parse_error_transpose)(e), _geterrposition = Module._geterrposition = () => (_geterrposition = Module._geterrposition = wasmExports.geterrposition)(), _getinternalerrposition = Module._getinternalerrposition = () => (_getinternalerrposition = Module._getinternalerrposition = wasmExports.getinternalerrposition)(), _pg_mblen = Module._pg_mblen = (e) => (_pg_mblen = Module._pg_mblen = wasmExports.pg_mblen)(e), _pg_mbstrlen_with_len = Module._pg_mbstrlen_with_len = (e, t2) => (_pg_mbstrlen_with_len = Module._pg_mbstrlen_with_len = wasmExports.pg_mbstrlen_with_len)(e, t2), _errposition = Module._errposition = (e) => (_errposition = Module._errposition = wasmExports.errposition)(e), _internalerrposition = Module._internalerrposition = (e) => (_internalerrposition = Module._internalerrposition = wasmExports.internalerrposition)(e), _internalerrquery = Module._internalerrquery = (e) => (_internalerrquery = Module._internalerrquery = wasmExports.internalerrquery)(e), _list_delete_nth_cell = Module._list_delete_nth_cell = (e, t2) => (_list_delete_nth_cell = Module._list_delete_nth_cell = wasmExports.list_delete_nth_cell)(e, t2), _get_array_type = Module._get_array_type = (e) => (_get_array_type = Module._get_array_type = wasmExports.get_array_type)(e), _smgrtruncate2 = Module._smgrtruncate2 = (e, t2, r, a2, o4) => (_smgrtruncate2 = Module._smgrtruncate2 = wasmExports.smgrtruncate2)(e, t2, r, a2, o4), _smgrreadv = Module._smgrreadv = (e, t2, r, a2, o4) => (_smgrreadv = Module._smgrreadv = wasmExports.smgrreadv)(e, t2, r, a2, o4), _NewRelationCreateToastTable = Module._NewRelationCreateToastTable = (e, t2) => (_NewRelationCreateToastTable = Module._NewRelationCreateToastTable = wasmExports.NewRelationCreateToastTable)(e, t2), _transformStmt = Module._transformStmt = (e, t2) => (_transformStmt = Module._transformStmt = wasmExports.transformStmt)(e, t2), _exprLocation = Module._exprLocation = (e) => (_exprLocation = Module._exprLocation = wasmExports.exprLocation)(e), _ParseFuncOrColumn = Module._ParseFuncOrColumn = (e, t2, r, a2, o4, s4, n3) => (_ParseFuncOrColumn = Module._ParseFuncOrColumn = wasmExports.ParseFuncOrColumn)(e, t2, r, a2, o4, s4, n3), _exprCollation = Module._exprCollation = (e) => (_exprCollation = Module._exprCollation = wasmExports.exprCollation)(e), _transformDistinctClause = Module._transformDistinctClause = (e, t2, r, a2) => (_transformDistinctClause = Module._transformDistinctClause = wasmExports.transformDistinctClause)(e, t2, r, a2), _makeTargetEntry = Module._makeTargetEntry = (e, t2, r, a2) => (_makeTargetEntry = Module._makeTargetEntry = wasmExports.makeTargetEntry)(e, t2, r, a2), _makeAlias = Module._makeAlias = (e, t2) => (_makeAlias = Module._makeAlias = wasmExports.makeAlias)(e, t2), _addRangeTableEntryForSubquery = Module._addRangeTableEntryForSubquery = (e, t2, r, a2, o4) => (_addRangeTableEntryForSubquery = Module._addRangeTableEntryForSubquery = wasmExports.addRangeTableEntryForSubquery)(e, t2, r, a2, o4), _makeVar = Module._makeVar = (e, t2, r, a2, o4, s4) => (_makeVar = Module._makeVar = wasmExports.makeVar)(e, t2, r, a2, o4, s4), _makeBoolean = Module._makeBoolean = (e) => (_makeBoolean = Module._makeBoolean = wasmExports.makeBoolean)(e), _makeInteger = Module._makeInteger = (e) => (_makeInteger = Module._makeInteger = wasmExports.makeInteger)(e), _makeTypeName = Module._makeTypeName = (e) => (_makeTypeName = Module._makeTypeName = wasmExports.makeTypeName)(e), _makeFuncCall = Module._makeFuncCall = (e, t2, r, a2) => (_makeFuncCall = Module._makeFuncCall = wasmExports.makeFuncCall)(e, t2, r, a2), _list_make4_impl = Module._list_make4_impl = (e, t2, r, a2, o4) => (_list_make4_impl = Module._list_make4_impl = wasmExports.list_make4_impl)(e, t2, r, a2, o4), _get_sortgroupclause_tle = Module._get_sortgroupclause_tle = (e, t2) => (_get_sortgroupclause_tle = Module._get_sortgroupclause_tle = wasmExports.get_sortgroupclause_tle)(e, t2), _flatten_join_alias_vars = Module._flatten_join_alias_vars = (e, t2, r) => (_flatten_join_alias_vars = Module._flatten_join_alias_vars = wasmExports.flatten_join_alias_vars)(e, t2, r), _list_member_int = Module._list_member_int = (e, t2) => (_list_member_int = Module._list_member_int = wasmExports.list_member_int)(e, t2), _addRangeTableEntryForENR = Module._addRangeTableEntryForENR = (e, t2, r) => (_addRangeTableEntryForENR = Module._addRangeTableEntryForENR = wasmExports.addRangeTableEntryForENR)(e, t2, r), _typenameTypeIdAndMod = Module._typenameTypeIdAndMod = (e, t2, r, a2) => (_typenameTypeIdAndMod = Module._typenameTypeIdAndMod = wasmExports.typenameTypeIdAndMod)(e, t2, r, a2), _get_typcollation = Module._get_typcollation = (e) => (_get_typcollation = Module._get_typcollation = wasmExports.get_typcollation)(e), _strip_implicit_coercions = Module._strip_implicit_coercions = (e) => (_strip_implicit_coercions = Module._strip_implicit_coercions = wasmExports.strip_implicit_coercions)(e), _get_sortgroupref_tle = Module._get_sortgroupref_tle = (e, t2) => (_get_sortgroupref_tle = Module._get_sortgroupref_tle = wasmExports.get_sortgroupref_tle)(e, t2), _contain_aggs_of_level = Module._contain_aggs_of_level = (e, t2) => (_contain_aggs_of_level = Module._contain_aggs_of_level = wasmExports.contain_aggs_of_level)(e, t2), _typeidType = Module._typeidType = (e) => (_typeidType = Module._typeidType = wasmExports.typeidType)(e), _typeTypeCollation = Module._typeTypeCollation = (e) => (_typeTypeCollation = Module._typeTypeCollation = wasmExports.typeTypeCollation)(e), _typeLen = Module._typeLen = (e) => (_typeLen = Module._typeLen = wasmExports.typeLen)(e), _typeByVal = Module._typeByVal = (e) => (_typeByVal = Module._typeByVal = wasmExports.typeByVal)(e), _makeConst = Module._makeConst = (e, t2, r, a2, o4, s4, n3) => (_makeConst = Module._makeConst = wasmExports.makeConst)(e, t2, r, a2, o4, s4, n3), _lookup_rowtype_tupdesc = Module._lookup_rowtype_tupdesc = (e, t2) => (_lookup_rowtype_tupdesc = Module._lookup_rowtype_tupdesc = wasmExports.lookup_rowtype_tupdesc)(e, t2), _bms_del_member = Module._bms_del_member = (e, t2) => (_bms_del_member = Module._bms_del_member = wasmExports.bms_del_member)(e, t2), _list_member = Module._list_member = (e, t2) => (_list_member = Module._list_member = wasmExports.list_member)(e, t2), _type_is_rowtype = Module._type_is_rowtype = (e) => (_type_is_rowtype = Module._type_is_rowtype = wasmExports.type_is_rowtype)(e), _bit_in = Module._bit_in = (e) => (_bit_in = Module._bit_in = wasmExports.bit_in)(e), _bms_union = Module._bms_union = (e, t2) => (_bms_union = Module._bms_union = wasmExports.bms_union)(e, t2), _varstr_levenshtein_less_equal = Module._varstr_levenshtein_less_equal = (e, t2, r, a2, o4, s4, n3, _3, l3) => (_varstr_levenshtein_less_equal = Module._varstr_levenshtein_less_equal = wasmExports.varstr_levenshtein_less_equal)(e, t2, r, a2, o4, s4, n3, _3, l3), _errsave_start = Module._errsave_start = (e, t2) => (_errsave_start = Module._errsave_start = wasmExports.errsave_start)(e, t2), _errsave_finish = Module._errsave_finish = (e, t2, r, a2) => (_errsave_finish = Module._errsave_finish = wasmExports.errsave_finish)(e, t2, r, a2), _makeColumnDef = Module._makeColumnDef = (e, t2, r, a2) => (_makeColumnDef = Module._makeColumnDef = wasmExports.makeColumnDef)(e, t2, r, a2), _GetDefaultOpClass = Module._GetDefaultOpClass = (e, t2) => (_GetDefaultOpClass = Module._GetDefaultOpClass = wasmExports.GetDefaultOpClass)(e, t2), _scanner_init = Module._scanner_init = (e, t2, r, a2) => (_scanner_init = Module._scanner_init = wasmExports.scanner_init)(e, t2, r, a2), _scanner_finish = Module._scanner_finish = (e) => (_scanner_finish = Module._scanner_finish = wasmExports.scanner_finish)(e), _core_yylex = Module._core_yylex = (e, t2, r) => (_core_yylex = Module._core_yylex = wasmExports.core_yylex)(e, t2, r), _isxdigit = Module._isxdigit = (e) => (_isxdigit = Module._isxdigit = wasmExports.isxdigit)(e), _scanner_isspace = Module._scanner_isspace = (e) => (_scanner_isspace = Module._scanner_isspace = wasmExports.scanner_isspace)(e), _truncate_identifier = Module._truncate_identifier = (e, t2, r) => (_truncate_identifier = Module._truncate_identifier = wasmExports.truncate_identifier)(e, t2, r), _downcase_truncate_identifier = Module._downcase_truncate_identifier = (e, t2, r) => (_downcase_truncate_identifier = Module._downcase_truncate_identifier = wasmExports.downcase_truncate_identifier)(e, t2, r), _pg_database_encoding_max_length = Module._pg_database_encoding_max_length = () => (_pg_database_encoding_max_length = Module._pg_database_encoding_max_length = wasmExports.pg_database_encoding_max_length)(), _namein = Module._namein = (e) => (_namein = Module._namein = wasmExports.namein)(e), _BlockSampler_Init = Module._BlockSampler_Init = (e, t2, r, a2) => (_BlockSampler_Init = Module._BlockSampler_Init = wasmExports.BlockSampler_Init)(e, t2, r, a2), _reservoir_init_selection_state = Module._reservoir_init_selection_state = (e, t2) => (_reservoir_init_selection_state = Module._reservoir_init_selection_state = wasmExports.reservoir_init_selection_state)(e, t2), _reservoir_get_next_S = Module._reservoir_get_next_S = (e, t2, r) => (_reservoir_get_next_S = Module._reservoir_get_next_S = wasmExports.reservoir_get_next_S)(e, t2, r), _sampler_random_fract = Module._sampler_random_fract = (e) => (_sampler_random_fract = Module._sampler_random_fract = wasmExports.sampler_random_fract)(e), _BlockSampler_HasMore = Module._BlockSampler_HasMore = (e) => (_BlockSampler_HasMore = Module._BlockSampler_HasMore = wasmExports.BlockSampler_HasMore)(e), _BlockSampler_Next = Module._BlockSampler_Next = (e) => (_BlockSampler_Next = Module._BlockSampler_Next = wasmExports.BlockSampler_Next)(e), _Async_Notify = Module._Async_Notify = (e, t2) => (_Async_Notify = Module._Async_Notify = wasmExports.Async_Notify)(e, t2), _RangeVarCallbackMaintainsTable = Module._RangeVarCallbackMaintainsTable = (e, t2, r, a2) => (_RangeVarCallbackMaintainsTable = Module._RangeVarCallbackMaintainsTable = wasmExports.RangeVarCallbackMaintainsTable)(e, t2, r, a2), _make_new_heap = Module._make_new_heap = (e, t2, r, a2, o4) => (_make_new_heap = Module._make_new_heap = wasmExports.make_new_heap)(e, t2, r, a2, o4), _finish_heap_swap = Module._finish_heap_swap = (e, t2, r, a2, o4, s4, n3, _3, l3) => (_finish_heap_swap = Module._finish_heap_swap = wasmExports.finish_heap_swap)(e, t2, r, a2, o4, s4, n3, _3, l3), _wasm_OpenPipeStream = Module._wasm_OpenPipeStream = (e, t2) => (_wasm_OpenPipeStream = Module._wasm_OpenPipeStream = wasmExports.wasm_OpenPipeStream)(e, t2), _ClosePipeStream = Module._ClosePipeStream = (e) => (_ClosePipeStream = Module._ClosePipeStream = wasmExports.ClosePipeStream)(e), _BeginCopyFrom = Module._BeginCopyFrom = (e, t2, r, a2, o4, s4, n3, _3) => (_BeginCopyFrom = Module._BeginCopyFrom = wasmExports.BeginCopyFrom)(e, t2, r, a2, o4, s4, n3, _3), _EndCopyFrom = Module._EndCopyFrom = (e) => (_EndCopyFrom = Module._EndCopyFrom = wasmExports.EndCopyFrom)(e), _ProcessCopyOptions = Module._ProcessCopyOptions = (e, t2, r, a2) => (_ProcessCopyOptions = Module._ProcessCopyOptions = wasmExports.ProcessCopyOptions)(e, t2, r, a2), _CopyFromErrorCallback = Module._CopyFromErrorCallback = (e) => (_CopyFromErrorCallback = Module._CopyFromErrorCallback = wasmExports.CopyFromErrorCallback)(e), _NextCopyFrom = Module._NextCopyFrom = (e, t2, r, a2) => (_NextCopyFrom = Module._NextCopyFrom = wasmExports.NextCopyFrom)(e, t2, r, a2), _ExecInitExpr = Module._ExecInitExpr = (e, t2) => (_ExecInitExpr = Module._ExecInitExpr = wasmExports.ExecInitExpr)(e, t2), _tolower = Module._tolower = (e) => (_tolower = Module._tolower = wasmExports.tolower)(e), _PushCopiedSnapshot = Module._PushCopiedSnapshot = (e) => (_PushCopiedSnapshot = Module._PushCopiedSnapshot = wasmExports.PushCopiedSnapshot)(e), _UpdateActiveSnapshotCommandId = Module._UpdateActiveSnapshotCommandId = () => (_UpdateActiveSnapshotCommandId = Module._UpdateActiveSnapshotCommandId = wasmExports.UpdateActiveSnapshotCommandId)(), _CreateQueryDesc = Module._CreateQueryDesc = (e, t2, r, a2, o4, s4, n3, _3) => (_CreateQueryDesc = Module._CreateQueryDesc = wasmExports.CreateQueryDesc)(e, t2, r, a2, o4, s4, n3, _3), _ExecutorStart = Module._ExecutorStart = (e, t2) => (_ExecutorStart = Module._ExecutorStart = wasmExports.ExecutorStart)(e, t2), _ExecutorFinish = Module._ExecutorFinish = (e) => (_ExecutorFinish = Module._ExecutorFinish = wasmExports.ExecutorFinish)(e), _ExecutorEnd = Module._ExecutorEnd = (e) => (_ExecutorEnd = Module._ExecutorEnd = wasmExports.ExecutorEnd)(e), _FreeQueryDesc = Module._FreeQueryDesc = (e) => (_FreeQueryDesc = Module._FreeQueryDesc = wasmExports.FreeQueryDesc)(e), _pg_server_to_any = Module._pg_server_to_any = (e, t2, r) => (_pg_server_to_any = Module._pg_server_to_any = wasmExports.pg_server_to_any)(e, t2, r), _ExecutorRun = Module._ExecutorRun = (e, t2, r, a2) => (_ExecutorRun = Module._ExecutorRun = wasmExports.ExecutorRun)(e, t2, r, a2), _CreateTableAsRelExists = Module._CreateTableAsRelExists = (e) => (_CreateTableAsRelExists = Module._CreateTableAsRelExists = wasmExports.CreateTableAsRelExists)(e), _DefineRelation = Module._DefineRelation = (e, t2, r, a2, o4, s4) => (_DefineRelation = Module._DefineRelation = wasmExports.DefineRelation)(e, t2, r, a2, o4, s4), _oidin = Module._oidin = (e) => (_oidin = Module._oidin = wasmExports.oidin)(e), _GetCommandTagName = Module._GetCommandTagName = (e) => (_GetCommandTagName = Module._GetCommandTagName = wasmExports.GetCommandTagName)(e), _ExplainBeginOutput = Module._ExplainBeginOutput = (e) => (_ExplainBeginOutput = Module._ExplainBeginOutput = wasmExports.ExplainBeginOutput)(e), _NewExplainState = Module._NewExplainState = () => (_NewExplainState = Module._NewExplainState = wasmExports.NewExplainState)(), _ExplainEndOutput = Module._ExplainEndOutput = (e) => (_ExplainEndOutput = Module._ExplainEndOutput = wasmExports.ExplainEndOutput)(e), _ExplainPrintPlan = Module._ExplainPrintPlan = (e, t2) => (_ExplainPrintPlan = Module._ExplainPrintPlan = wasmExports.ExplainPrintPlan)(e, t2), _ExplainPrintTriggers = Module._ExplainPrintTriggers = (e, t2) => (_ExplainPrintTriggers = Module._ExplainPrintTriggers = wasmExports.ExplainPrintTriggers)(e, t2), _ExplainPrintJITSummary = Module._ExplainPrintJITSummary = (e, t2) => (_ExplainPrintJITSummary = Module._ExplainPrintJITSummary = wasmExports.ExplainPrintJITSummary)(e, t2), _InstrEndLoop = Module._InstrEndLoop = (e) => (_InstrEndLoop = Module._InstrEndLoop = wasmExports.InstrEndLoop)(e), _ExplainPropertyInteger = Module._ExplainPropertyInteger = (e, t2, r, a2) => (_ExplainPropertyInteger = Module._ExplainPropertyInteger = wasmExports.ExplainPropertyInteger)(e, t2, r, a2), _ExplainQueryText = Module._ExplainQueryText = (e, t2) => (_ExplainQueryText = Module._ExplainQueryText = wasmExports.ExplainQueryText)(e, t2), _ExplainPropertyText = Module._ExplainPropertyText = (e, t2, r) => (_ExplainPropertyText = Module._ExplainPropertyText = wasmExports.ExplainPropertyText)(e, t2, r), _ExplainQueryParameters = Module._ExplainQueryParameters = (e, t2, r) => (_ExplainQueryParameters = Module._ExplainQueryParameters = wasmExports.ExplainQueryParameters)(e, t2, r), _get_func_namespace = Module._get_func_namespace = (e) => (_get_func_namespace = Module._get_func_namespace = wasmExports.get_func_namespace)(e), _get_rel_type_id = Module._get_rel_type_id = (e) => (_get_rel_type_id = Module._get_rel_type_id = wasmExports.get_rel_type_id)(e), _set_config_option = Module._set_config_option = (e, t2, r, a2, o4, s4, n3, _3) => (_set_config_option = Module._set_config_option = wasmExports.set_config_option)(e, t2, r, a2, o4, s4, n3, _3), _pg_any_to_server = Module._pg_any_to_server = (e, t2, r) => (_pg_any_to_server = Module._pg_any_to_server = wasmExports.pg_any_to_server)(e, t2, r), _DirectFunctionCall4Coll = Module._DirectFunctionCall4Coll = (e, t2, r, a2, o4, s4) => (_DirectFunctionCall4Coll = Module._DirectFunctionCall4Coll = wasmExports.DirectFunctionCall4Coll)(e, t2, r, a2, o4, s4), _list_delete_cell = Module._list_delete_cell = (e, t2) => (_list_delete_cell = Module._list_delete_cell = wasmExports.list_delete_cell)(e, t2), _GetForeignDataWrapper = Module._GetForeignDataWrapper = (e) => (_GetForeignDataWrapper = Module._GetForeignDataWrapper = wasmExports.GetForeignDataWrapper)(e), _CreateExprContext = Module._CreateExprContext = (e) => (_CreateExprContext = Module._CreateExprContext = wasmExports.CreateExprContext)(e), _EnsurePortalSnapshotExists = Module._EnsurePortalSnapshotExists = () => (_EnsurePortalSnapshotExists = Module._EnsurePortalSnapshotExists = wasmExports.EnsurePortalSnapshotExists)(), _CheckIndexCompatible = Module._CheckIndexCompatible = (e, t2, r, a2) => (_CheckIndexCompatible = Module._CheckIndexCompatible = wasmExports.CheckIndexCompatible)(e, t2, r, a2), _pgstat_count_truncate = Module._pgstat_count_truncate = (e) => (_pgstat_count_truncate = Module._pgstat_count_truncate = wasmExports.pgstat_count_truncate)(e), _SPI_connect = Module._SPI_connect = () => (_SPI_connect = Module._SPI_connect = wasmExports.SPI_connect)(), _SPI_exec = Module._SPI_exec = (e, t2) => (_SPI_exec = Module._SPI_exec = wasmExports.SPI_exec)(e, t2), _SPI_execute = Module._SPI_execute = (e, t2, r) => (_SPI_execute = Module._SPI_execute = wasmExports.SPI_execute)(e, t2, r), _SPI_getvalue = Module._SPI_getvalue = (e, t2, r) => (_SPI_getvalue = Module._SPI_getvalue = wasmExports.SPI_getvalue)(e, t2, r), _generate_operator_clause = Module._generate_operator_clause = (e, t2, r, a2, o4, s4) => (_generate_operator_clause = Module._generate_operator_clause = wasmExports.generate_operator_clause)(e, t2, r, a2, o4, s4), _SPI_finish = Module._SPI_finish = () => (_SPI_finish = Module._SPI_finish = wasmExports.SPI_finish)(), _CreateTransientRelDestReceiver = Module._CreateTransientRelDestReceiver = (e) => (_CreateTransientRelDestReceiver = Module._CreateTransientRelDestReceiver = wasmExports.CreateTransientRelDestReceiver)(e), _MemoryContextSetIdentifier = Module._MemoryContextSetIdentifier = (e, t2) => (_MemoryContextSetIdentifier = Module._MemoryContextSetIdentifier = wasmExports.MemoryContextSetIdentifier)(e, t2), _checkExprHasSubLink = Module._checkExprHasSubLink = (e) => (_checkExprHasSubLink = Module._checkExprHasSubLink = wasmExports.checkExprHasSubLink)(e), _SetTuplestoreDestReceiverParams = Module._SetTuplestoreDestReceiverParams = (e, t2, r, a2, o4, s4) => (_SetTuplestoreDestReceiverParams = Module._SetTuplestoreDestReceiverParams = wasmExports.SetTuplestoreDestReceiverParams)(e, t2, r, a2, o4, s4), _tuplestore_rescan = Module._tuplestore_rescan = (e) => (_tuplestore_rescan = Module._tuplestore_rescan = wasmExports.tuplestore_rescan)(e), _MemoryContextDeleteChildren = Module._MemoryContextDeleteChildren = (e) => (_MemoryContextDeleteChildren = Module._MemoryContextDeleteChildren = wasmExports.MemoryContextDeleteChildren)(e), _ReleaseCachedPlan = Module._ReleaseCachedPlan = (e, t2) => (_ReleaseCachedPlan = Module._ReleaseCachedPlan = wasmExports.ReleaseCachedPlan)(e, t2), _nextval = Module._nextval = (e) => (_nextval = Module._nextval = wasmExports.nextval)(e), _textToQualifiedNameList = Module._textToQualifiedNameList = (e) => (_textToQualifiedNameList = Module._textToQualifiedNameList = wasmExports.textToQualifiedNameList)(e), _tuplestore_gettupleslot = Module._tuplestore_gettupleslot = (e, t2, r, a2) => (_tuplestore_gettupleslot = Module._tuplestore_gettupleslot = wasmExports.tuplestore_gettupleslot)(e, t2, r, a2), _list_delete = Module._list_delete = (e, t2) => (_list_delete = Module._list_delete = wasmExports.list_delete)(e, t2), _tuplestore_end = Module._tuplestore_end = (e) => (_tuplestore_end = Module._tuplestore_end = wasmExports.tuplestore_end)(e), _quote_literal_cstr = Module._quote_literal_cstr = (e) => (_quote_literal_cstr = Module._quote_literal_cstr = wasmExports.quote_literal_cstr)(e), _contain_mutable_functions = Module._contain_mutable_functions = (e) => (_contain_mutable_functions = Module._contain_mutable_functions = wasmExports.contain_mutable_functions)(e), _ExecuteTruncateGuts = Module._ExecuteTruncateGuts = (e, t2, r, a2, o4, s4) => (_ExecuteTruncateGuts = Module._ExecuteTruncateGuts = wasmExports.ExecuteTruncateGuts)(e, t2, r, a2, o4, s4), _bms_make_singleton = Module._bms_make_singleton = (e) => (_bms_make_singleton = Module._bms_make_singleton = wasmExports.bms_make_singleton)(e), _tuplestore_puttupleslot = Module._tuplestore_puttupleslot = (e, t2) => (_tuplestore_puttupleslot = Module._tuplestore_puttupleslot = wasmExports.tuplestore_puttupleslot)(e, t2), _tuplestore_begin_heap = Module._tuplestore_begin_heap = (e, t2, r) => (_tuplestore_begin_heap = Module._tuplestore_begin_heap = wasmExports.tuplestore_begin_heap)(e, t2, r), _ExecForceStoreHeapTuple = Module._ExecForceStoreHeapTuple = (e, t2, r) => (_ExecForceStoreHeapTuple = Module._ExecForceStoreHeapTuple = wasmExports.ExecForceStoreHeapTuple)(e, t2, r), _strtod = Module._strtod = (e, t2) => (_strtod = Module._strtod = wasmExports.strtod)(e, t2), _plain_crypt_verify = Module._plain_crypt_verify = (e, t2, r, a2) => (_plain_crypt_verify = Module._plain_crypt_verify = wasmExports.plain_crypt_verify)(e, t2, r, a2), _ProcessConfigFile = Module._ProcessConfigFile = (e) => (_ProcessConfigFile = Module._ProcessConfigFile = wasmExports.ProcessConfigFile)(e), _ExecReScan = Module._ExecReScan = (e) => (_ExecReScan = Module._ExecReScan = wasmExports.ExecReScan)(e), _ExecAsyncResponse = Module._ExecAsyncResponse = (e) => (_ExecAsyncResponse = Module._ExecAsyncResponse = wasmExports.ExecAsyncResponse)(e), _ExecAsyncRequestDone = Module._ExecAsyncRequestDone = (e, t2) => (_ExecAsyncRequestDone = Module._ExecAsyncRequestDone = wasmExports.ExecAsyncRequestDone)(e, t2), _ExecAsyncRequestPending = Module._ExecAsyncRequestPending = (e) => (_ExecAsyncRequestPending = Module._ExecAsyncRequestPending = wasmExports.ExecAsyncRequestPending)(e), _ExprEvalPushStep = Module._ExprEvalPushStep = (e, t2) => (_ExprEvalPushStep = Module._ExprEvalPushStep = wasmExports.ExprEvalPushStep)(e, t2), _ExecInitExprWithParams = Module._ExecInitExprWithParams = (e, t2) => (_ExecInitExprWithParams = Module._ExecInitExprWithParams = wasmExports.ExecInitExprWithParams)(e, t2), _ExecInitExprList = Module._ExecInitExprList = (e, t2) => (_ExecInitExprList = Module._ExecInitExprList = wasmExports.ExecInitExprList)(e, t2), _MakeExpandedObjectReadOnlyInternal = Module._MakeExpandedObjectReadOnlyInternal = (e) => (_MakeExpandedObjectReadOnlyInternal = Module._MakeExpandedObjectReadOnlyInternal = wasmExports.MakeExpandedObjectReadOnlyInternal)(e), _tuplesort_puttupleslot = Module._tuplesort_puttupleslot = (e, t2) => (_tuplesort_puttupleslot = Module._tuplesort_puttupleslot = wasmExports.tuplesort_puttupleslot)(e, t2), _ArrayGetNItems = Module._ArrayGetNItems = (e, t2) => (_ArrayGetNItems = Module._ArrayGetNItems = wasmExports.ArrayGetNItems)(e, t2), _expanded_record_fetch_tupdesc = Module._expanded_record_fetch_tupdesc = (e) => (_expanded_record_fetch_tupdesc = Module._expanded_record_fetch_tupdesc = wasmExports.expanded_record_fetch_tupdesc)(e), _expanded_record_fetch_field = Module._expanded_record_fetch_field = (e, t2, r) => (_expanded_record_fetch_field = Module._expanded_record_fetch_field = wasmExports.expanded_record_fetch_field)(e, t2, r), _JsonbValueToJsonb = Module._JsonbValueToJsonb = (e) => (_JsonbValueToJsonb = Module._JsonbValueToJsonb = wasmExports.JsonbValueToJsonb)(e), _boolout = Module._boolout = (e) => (_boolout = Module._boolout = wasmExports.boolout)(e), _lookup_rowtype_tupdesc_domain = Module._lookup_rowtype_tupdesc_domain = (e, t2, r) => (_lookup_rowtype_tupdesc_domain = Module._lookup_rowtype_tupdesc_domain = wasmExports.lookup_rowtype_tupdesc_domain)(e, t2, r), _MemoryContextGetParent = Module._MemoryContextGetParent = (e) => (_MemoryContextGetParent = Module._MemoryContextGetParent = wasmExports.MemoryContextGetParent)(e), _DeleteExpandedObject = Module._DeleteExpandedObject = (e) => (_DeleteExpandedObject = Module._DeleteExpandedObject = wasmExports.DeleteExpandedObject)(e), _ExecFindJunkAttributeInTlist = Module._ExecFindJunkAttributeInTlist = (e, t2) => (_ExecFindJunkAttributeInTlist = Module._ExecFindJunkAttributeInTlist = wasmExports.ExecFindJunkAttributeInTlist)(e, t2), _standard_ExecutorStart = Module._standard_ExecutorStart = (e, t2) => (_standard_ExecutorStart = Module._standard_ExecutorStart = wasmExports.standard_ExecutorStart)(e, t2), _standard_ExecutorRun = Module._standard_ExecutorRun = (e, t2, r, a2) => (_standard_ExecutorRun = Module._standard_ExecutorRun = wasmExports.standard_ExecutorRun)(e, t2, r, a2), _standard_ExecutorFinish = Module._standard_ExecutorFinish = (e) => (_standard_ExecutorFinish = Module._standard_ExecutorFinish = wasmExports.standard_ExecutorFinish)(e), _standard_ExecutorEnd = Module._standard_ExecutorEnd = (e) => (_standard_ExecutorEnd = Module._standard_ExecutorEnd = wasmExports.standard_ExecutorEnd)(e), _InstrAlloc = Module._InstrAlloc = (e, t2, r) => (_InstrAlloc = Module._InstrAlloc = wasmExports.InstrAlloc)(e, t2, r), _get_typlenbyval = Module._get_typlenbyval = (e, t2, r) => (_get_typlenbyval = Module._get_typlenbyval = wasmExports.get_typlenbyval)(e, t2, r), _InputFunctionCall = Module._InputFunctionCall = (e, t2, r, a2) => (_InputFunctionCall = Module._InputFunctionCall = wasmExports.InputFunctionCall)(e, t2, r, a2), _FreeExprContext = Module._FreeExprContext = (e, t2) => (_FreeExprContext = Module._FreeExprContext = wasmExports.FreeExprContext)(e, t2), _ExecOpenScanRelation = Module._ExecOpenScanRelation = (e, t2, r) => (_ExecOpenScanRelation = Module._ExecOpenScanRelation = wasmExports.ExecOpenScanRelation)(e, t2, r), _bms_intersect = Module._bms_intersect = (e, t2) => (_bms_intersect = Module._bms_intersect = wasmExports.bms_intersect)(e, t2), _ExecGetReturningSlot = Module._ExecGetReturningSlot = (e, t2) => (_ExecGetReturningSlot = Module._ExecGetReturningSlot = wasmExports.ExecGetReturningSlot)(e, t2), _ExecGetResultRelCheckAsUser = Module._ExecGetResultRelCheckAsUser = (e, t2) => (_ExecGetResultRelCheckAsUser = Module._ExecGetResultRelCheckAsUser = wasmExports.ExecGetResultRelCheckAsUser)(e, t2), _get_call_expr_argtype = Module._get_call_expr_argtype = (e, t2) => (_get_call_expr_argtype = Module._get_call_expr_argtype = wasmExports.get_call_expr_argtype)(e, t2), _tuplestore_clear = Module._tuplestore_clear = (e) => (_tuplestore_clear = Module._tuplestore_clear = wasmExports.tuplestore_clear)(e), _InstrUpdateTupleCount = Module._InstrUpdateTupleCount = (e, t2) => (_InstrUpdateTupleCount = Module._InstrUpdateTupleCount = wasmExports.InstrUpdateTupleCount)(e, t2), _tuplesort_begin_heap = Module._tuplesort_begin_heap = (e, t2, r, a2, o4, s4, n3, _3, l3) => (_tuplesort_begin_heap = Module._tuplesort_begin_heap = wasmExports.tuplesort_begin_heap)(e, t2, r, a2, o4, s4, n3, _3, l3), _tuplesort_gettupleslot = Module._tuplesort_gettupleslot = (e, t2, r, a2, o4) => (_tuplesort_gettupleslot = Module._tuplesort_gettupleslot = wasmExports.tuplesort_gettupleslot)(e, t2, r, a2, o4), _AddWaitEventToSet = Module._AddWaitEventToSet = (e, t2, r, a2, o4) => (_AddWaitEventToSet = Module._AddWaitEventToSet = wasmExports.AddWaitEventToSet)(e, t2, r, a2, o4), _GetNumRegisteredWaitEvents = Module._GetNumRegisteredWaitEvents = (e) => (_GetNumRegisteredWaitEvents = Module._GetNumRegisteredWaitEvents = wasmExports.GetNumRegisteredWaitEvents)(e), _get_attstatsslot = Module._get_attstatsslot = (e, t2, r, a2, o4) => (_get_attstatsslot = Module._get_attstatsslot = wasmExports.get_attstatsslot)(e, t2, r, a2, o4), _free_attstatsslot = Module._free_attstatsslot = (e) => (_free_attstatsslot = Module._free_attstatsslot = wasmExports.free_attstatsslot)(e), _tuplesort_reset = Module._tuplesort_reset = (e) => (_tuplesort_reset = Module._tuplesort_reset = wasmExports.tuplesort_reset)(e), _pairingheap_first = Module._pairingheap_first = (e) => (_pairingheap_first = Module._pairingheap_first = wasmExports.pairingheap_first)(e), _bms_nonempty_difference = Module._bms_nonempty_difference = (e, t2) => (_bms_nonempty_difference = Module._bms_nonempty_difference = wasmExports.bms_nonempty_difference)(e, t2), _SPI_connect_ext = Module._SPI_connect_ext = (e) => (_SPI_connect_ext = Module._SPI_connect_ext = wasmExports.SPI_connect_ext)(e), _SPI_commit = Module._SPI_commit = () => (_SPI_commit = Module._SPI_commit = wasmExports.SPI_commit)(), _CopyErrorData = Module._CopyErrorData = () => (_CopyErrorData = Module._CopyErrorData = wasmExports.CopyErrorData)(), _ReThrowError = Module._ReThrowError = (e) => (_ReThrowError = Module._ReThrowError = wasmExports.ReThrowError)(e), _SPI_commit_and_chain = Module._SPI_commit_and_chain = () => (_SPI_commit_and_chain = Module._SPI_commit_and_chain = wasmExports.SPI_commit_and_chain)(), _SPI_rollback = Module._SPI_rollback = () => (_SPI_rollback = Module._SPI_rollback = wasmExports.SPI_rollback)(), _SPI_rollback_and_chain = Module._SPI_rollback_and_chain = () => (_SPI_rollback_and_chain = Module._SPI_rollback_and_chain = wasmExports.SPI_rollback_and_chain)(), _SPI_freetuptable = Module._SPI_freetuptable = (e) => (_SPI_freetuptable = Module._SPI_freetuptable = wasmExports.SPI_freetuptable)(e), _SPI_execute_extended = Module._SPI_execute_extended = (e, t2) => (_SPI_execute_extended = Module._SPI_execute_extended = wasmExports.SPI_execute_extended)(e, t2), _SPI_execute_plan = Module._SPI_execute_plan = (e, t2, r, a2, o4) => (_SPI_execute_plan = Module._SPI_execute_plan = wasmExports.SPI_execute_plan)(e, t2, r, a2, o4), _SPI_execp = Module._SPI_execp = (e, t2, r, a2) => (_SPI_execp = Module._SPI_execp = wasmExports.SPI_execp)(e, t2, r, a2), _SPI_execute_plan_extended = Module._SPI_execute_plan_extended = (e, t2) => (_SPI_execute_plan_extended = Module._SPI_execute_plan_extended = wasmExports.SPI_execute_plan_extended)(e, t2), _SPI_execute_plan_with_paramlist = Module._SPI_execute_plan_with_paramlist = (e, t2, r, a2) => (_SPI_execute_plan_with_paramlist = Module._SPI_execute_plan_with_paramlist = wasmExports.SPI_execute_plan_with_paramlist)(e, t2, r, a2), _SPI_prepare = Module._SPI_prepare = (e, t2, r) => (_SPI_prepare = Module._SPI_prepare = wasmExports.SPI_prepare)(e, t2, r), _SPI_prepare_extended = Module._SPI_prepare_extended = (e, t2) => (_SPI_prepare_extended = Module._SPI_prepare_extended = wasmExports.SPI_prepare_extended)(e, t2), _SPI_keepplan = Module._SPI_keepplan = (e) => (_SPI_keepplan = Module._SPI_keepplan = wasmExports.SPI_keepplan)(e), _SPI_freeplan = Module._SPI_freeplan = (e) => (_SPI_freeplan = Module._SPI_freeplan = wasmExports.SPI_freeplan)(e), _SPI_copytuple = Module._SPI_copytuple = (e) => (_SPI_copytuple = Module._SPI_copytuple = wasmExports.SPI_copytuple)(e), _SPI_returntuple = Module._SPI_returntuple = (e, t2) => (_SPI_returntuple = Module._SPI_returntuple = wasmExports.SPI_returntuple)(e, t2), _SPI_fnumber = Module._SPI_fnumber = (e, t2) => (_SPI_fnumber = Module._SPI_fnumber = wasmExports.SPI_fnumber)(e, t2), _SPI_fname = Module._SPI_fname = (e, t2) => (_SPI_fname = Module._SPI_fname = wasmExports.SPI_fname)(e, t2), _SPI_getbinval = Module._SPI_getbinval = (e, t2, r, a2) => (_SPI_getbinval = Module._SPI_getbinval = wasmExports.SPI_getbinval)(e, t2, r, a2), _SPI_gettype = Module._SPI_gettype = (e, t2) => (_SPI_gettype = Module._SPI_gettype = wasmExports.SPI_gettype)(e, t2), _SPI_gettypeid = Module._SPI_gettypeid = (e, t2) => (_SPI_gettypeid = Module._SPI_gettypeid = wasmExports.SPI_gettypeid)(e, t2), _SPI_getrelname = Module._SPI_getrelname = (e) => (_SPI_getrelname = Module._SPI_getrelname = wasmExports.SPI_getrelname)(e), _SPI_palloc = Module._SPI_palloc = (e) => (_SPI_palloc = Module._SPI_palloc = wasmExports.SPI_palloc)(e), _SPI_datumTransfer = Module._SPI_datumTransfer = (e, t2, r) => (_SPI_datumTransfer = Module._SPI_datumTransfer = wasmExports.SPI_datumTransfer)(e, t2, r), _datumTransfer = Module._datumTransfer = (e, t2, r) => (_datumTransfer = Module._datumTransfer = wasmExports.datumTransfer)(e, t2, r), _SPI_cursor_open_with_paramlist = Module._SPI_cursor_open_with_paramlist = (e, t2, r, a2) => (_SPI_cursor_open_with_paramlist = Module._SPI_cursor_open_with_paramlist = wasmExports.SPI_cursor_open_with_paramlist)(e, t2, r, a2), _SPI_cursor_parse_open = Module._SPI_cursor_parse_open = (e, t2, r) => (_SPI_cursor_parse_open = Module._SPI_cursor_parse_open = wasmExports.SPI_cursor_parse_open)(e, t2, r), _SPI_cursor_find = Module._SPI_cursor_find = (e) => (_SPI_cursor_find = Module._SPI_cursor_find = wasmExports.SPI_cursor_find)(e), _SPI_cursor_fetch = Module._SPI_cursor_fetch = (e, t2, r) => (_SPI_cursor_fetch = Module._SPI_cursor_fetch = wasmExports.SPI_cursor_fetch)(e, t2, r), _SPI_scroll_cursor_fetch = Module._SPI_scroll_cursor_fetch = (e, t2, r) => (_SPI_scroll_cursor_fetch = Module._SPI_scroll_cursor_fetch = wasmExports.SPI_scroll_cursor_fetch)(e, t2, r), _SPI_scroll_cursor_move = Module._SPI_scroll_cursor_move = (e, t2, r) => (_SPI_scroll_cursor_move = Module._SPI_scroll_cursor_move = wasmExports.SPI_scroll_cursor_move)(e, t2, r), _SPI_cursor_close = Module._SPI_cursor_close = (e) => (_SPI_cursor_close = Module._SPI_cursor_close = wasmExports.SPI_cursor_close)(e), _SPI_plan_is_valid = Module._SPI_plan_is_valid = (e) => (_SPI_plan_is_valid = Module._SPI_plan_is_valid = wasmExports.SPI_plan_is_valid)(e), _SPI_result_code_string = Module._SPI_result_code_string = (e) => (_SPI_result_code_string = Module._SPI_result_code_string = wasmExports.SPI_result_code_string)(e), _SPI_plan_get_plan_sources = Module._SPI_plan_get_plan_sources = (e) => (_SPI_plan_get_plan_sources = Module._SPI_plan_get_plan_sources = wasmExports.SPI_plan_get_plan_sources)(e), _SPI_plan_get_cached_plan = Module._SPI_plan_get_cached_plan = (e) => (_SPI_plan_get_cached_plan = Module._SPI_plan_get_cached_plan = wasmExports.SPI_plan_get_cached_plan)(e), _SPI_register_relation = Module._SPI_register_relation = (e) => (_SPI_register_relation = Module._SPI_register_relation = wasmExports.SPI_register_relation)(e), _create_queryEnv = Module._create_queryEnv = () => (_create_queryEnv = Module._create_queryEnv = wasmExports.create_queryEnv)(), _register_ENR = Module._register_ENR = (e, t2) => (_register_ENR = Module._register_ENR = wasmExports.register_ENR)(e, t2), _SPI_register_trigger_data = Module._SPI_register_trigger_data = (e) => (_SPI_register_trigger_data = Module._SPI_register_trigger_data = wasmExports.SPI_register_trigger_data)(e), _tuplestore_tuple_count = Module._tuplestore_tuple_count = (e) => (_tuplestore_tuple_count = Module._tuplestore_tuple_count = wasmExports.tuplestore_tuple_count)(e), _GetUserMapping = Module._GetUserMapping = (e, t2) => (_GetUserMapping = Module._GetUserMapping = wasmExports.GetUserMapping)(e, t2), _GetForeignTable = Module._GetForeignTable = (e) => (_GetForeignTable = Module._GetForeignTable = wasmExports.GetForeignTable)(e), _GetForeignColumnOptions = Module._GetForeignColumnOptions = (e, t2) => (_GetForeignColumnOptions = Module._GetForeignColumnOptions = wasmExports.GetForeignColumnOptions)(e, t2), _initClosestMatch = Module._initClosestMatch = (e, t2, r) => (_initClosestMatch = Module._initClosestMatch = wasmExports.initClosestMatch)(e, t2, r), _updateClosestMatch = Module._updateClosestMatch = (e, t2) => (_updateClosestMatch = Module._updateClosestMatch = wasmExports.updateClosestMatch)(e, t2), _getClosestMatch = Module._getClosestMatch = (e) => (_getClosestMatch = Module._getClosestMatch = wasmExports.getClosestMatch)(e), _GetExistingLocalJoinPath = Module._GetExistingLocalJoinPath = (e) => (_GetExistingLocalJoinPath = Module._GetExistingLocalJoinPath = wasmExports.GetExistingLocalJoinPath)(e), _bloom_create = Module._bloom_create = (e, t2, r) => (_bloom_create = Module._bloom_create = wasmExports.bloom_create)(e, t2, r), _bloom_free = Module._bloom_free = (e) => (_bloom_free = Module._bloom_free = wasmExports.bloom_free)(e), _bloom_add_element = Module._bloom_add_element = (e, t2, r) => (_bloom_add_element = Module._bloom_add_element = wasmExports.bloom_add_element)(e, t2, r), _bloom_lacks_element = Module._bloom_lacks_element = (e, t2, r) => (_bloom_lacks_element = Module._bloom_lacks_element = wasmExports.bloom_lacks_element)(e, t2, r), _bloom_prop_bits_set = Module._bloom_prop_bits_set = (e) => (_bloom_prop_bits_set = Module._bloom_prop_bits_set = wasmExports.bloom_prop_bits_set)(e), _gai_strerror = Module._gai_strerror = (e) => (_gai_strerror = Module._gai_strerror = wasmExports.gai_strerror)(e), _socket = Module._socket = (e, t2, r) => (_socket = Module._socket = wasmExports.socket)(e, t2, r), _connect = Module._connect = (e, t2, r) => (_connect = Module._connect = wasmExports.connect)(e, t2, r), _send = Module._send = (e, t2, r, a2) => (_send = Module._send = wasmExports.send)(e, t2, r, a2), _recv = Module._recv = (e, t2, r, a2) => (_recv = Module._recv = wasmExports.recv)(e, t2, r, a2), _be_lo_unlink = Module._be_lo_unlink = (e) => (_be_lo_unlink = Module._be_lo_unlink = wasmExports.be_lo_unlink)(e), _text_to_cstring_buffer = Module._text_to_cstring_buffer = (e, t2, r) => (_text_to_cstring_buffer = Module._text_to_cstring_buffer = wasmExports.text_to_cstring_buffer)(e, t2, r), _set_read_write_cbs = Module._set_read_write_cbs = (e, t2) => (_set_read_write_cbs = Module._set_read_write_cbs = wasmExports.set_read_write_cbs)(e, t2), _setsockopt = Module._setsockopt = (e, t2, r, a2, o4) => (_setsockopt = Module._setsockopt = wasmExports.setsockopt)(e, t2, r, a2, o4), _getsockopt = Module._getsockopt = (e, t2, r, a2, o4) => (_getsockopt = Module._getsockopt = wasmExports.getsockopt)(e, t2, r, a2, o4), _getsockname = Module._getsockname = (e, t2, r) => (_getsockname = Module._getsockname = wasmExports.getsockname)(e, t2, r), _poll = Module._poll = (e, t2, r) => (_poll = Module._poll = wasmExports.poll)(e, t2, r), _pg_mb2wchar_with_len = Module._pg_mb2wchar_with_len = (e, t2, r) => (_pg_mb2wchar_with_len = Module._pg_mb2wchar_with_len = wasmExports.pg_mb2wchar_with_len)(e, t2, r), _pg_regcomp = Module._pg_regcomp = (e, t2, r, a2, o4) => (_pg_regcomp = Module._pg_regcomp = wasmExports.pg_regcomp)(e, t2, r, a2, o4), _pg_regerror = Module._pg_regerror = (e, t2, r, a2) => (_pg_regerror = Module._pg_regerror = wasmExports.pg_regerror)(e, t2, r, a2), _strcat = Module._strcat = (e, t2) => (_strcat = Module._strcat = wasmExports.strcat)(e, t2), _pq_sendtext = Module._pq_sendtext = (e, t2, r) => (_pq_sendtext = Module._pq_sendtext = wasmExports.pq_sendtext)(e, t2, r), _pq_sendfloat4 = Module._pq_sendfloat4 = (e, t2) => (_pq_sendfloat4 = Module._pq_sendfloat4 = wasmExports.pq_sendfloat4)(e, t2), _pq_sendfloat8 = Module._pq_sendfloat8 = (e, t2) => (_pq_sendfloat8 = Module._pq_sendfloat8 = wasmExports.pq_sendfloat8)(e, t2), _pq_begintypsend = Module._pq_begintypsend = (e) => (_pq_begintypsend = Module._pq_begintypsend = wasmExports.pq_begintypsend)(e), _pq_endtypsend = Module._pq_endtypsend = (e) => (_pq_endtypsend = Module._pq_endtypsend = wasmExports.pq_endtypsend)(e), _pq_getmsgfloat4 = Module._pq_getmsgfloat4 = (e) => (_pq_getmsgfloat4 = Module._pq_getmsgfloat4 = wasmExports.pq_getmsgfloat4)(e), _pq_getmsgfloat8 = Module._pq_getmsgfloat8 = (e) => (_pq_getmsgfloat8 = Module._pq_getmsgfloat8 = wasmExports.pq_getmsgfloat8)(e), _pq_getmsgtext = Module._pq_getmsgtext = (e, t2, r) => (_pq_getmsgtext = Module._pq_getmsgtext = wasmExports.pq_getmsgtext)(e, t2, r), _pg_strtoint32 = Module._pg_strtoint32 = (e) => (_pg_strtoint32 = Module._pg_strtoint32 = wasmExports.pg_strtoint32)(e), _bms_membership = Module._bms_membership = (e) => (_bms_membership = Module._bms_membership = wasmExports.bms_membership)(e), _list_make5_impl = Module._list_make5_impl = (e, t2, r, a2, o4, s4) => (_list_make5_impl = Module._list_make5_impl = wasmExports.list_make5_impl)(e, t2, r, a2, o4, s4), _list_insert_nth = Module._list_insert_nth = (e, t2, r) => (_list_insert_nth = Module._list_insert_nth = wasmExports.list_insert_nth)(e, t2, r), _list_member_ptr = Module._list_member_ptr = (e, t2) => (_list_member_ptr = Module._list_member_ptr = wasmExports.list_member_ptr)(e, t2), _list_append_unique_ptr = Module._list_append_unique_ptr = (e, t2) => (_list_append_unique_ptr = Module._list_append_unique_ptr = wasmExports.list_append_unique_ptr)(e, t2), _make_opclause = Module._make_opclause = (e, t2, r, a2, o4, s4, n3) => (_make_opclause = Module._make_opclause = wasmExports.make_opclause)(e, t2, r, a2, o4, s4, n3), _exprIsLengthCoercion = Module._exprIsLengthCoercion = (e, t2) => (_exprIsLengthCoercion = Module._exprIsLengthCoercion = wasmExports.exprIsLengthCoercion)(e, t2), _fix_opfuncids = Module._fix_opfuncids = (e) => (_fix_opfuncids = Module._fix_opfuncids = wasmExports.fix_opfuncids)(e), _CleanQuerytext = Module._CleanQuerytext = (e, t2, r) => (_CleanQuerytext = Module._CleanQuerytext = wasmExports.CleanQuerytext)(e, t2, r), _EnableQueryId = Module._EnableQueryId = () => (_EnableQueryId = Module._EnableQueryId = wasmExports.EnableQueryId)(), _find_base_rel = Module._find_base_rel = (e, t2) => (_find_base_rel = Module._find_base_rel = wasmExports.find_base_rel)(e, t2), _add_path = Module._add_path = (e, t2) => (_add_path = Module._add_path = wasmExports.add_path)(e, t2), _pathkeys_contained_in = Module._pathkeys_contained_in = (e, t2) => (_pathkeys_contained_in = Module._pathkeys_contained_in = wasmExports.pathkeys_contained_in)(e, t2), _create_sort_path = Module._create_sort_path = (e, t2, r, a2, o4) => (_create_sort_path = Module._create_sort_path = wasmExports.create_sort_path)(e, t2, r, a2, o4), _set_baserel_size_estimates = Module._set_baserel_size_estimates = (e, t2) => (_set_baserel_size_estimates = Module._set_baserel_size_estimates = wasmExports.set_baserel_size_estimates)(e, t2), _clauselist_selectivity = Module._clauselist_selectivity = (e, t2, r, a2, o4) => (_clauselist_selectivity = Module._clauselist_selectivity = wasmExports.clauselist_selectivity)(e, t2, r, a2, o4), _get_tablespace_page_costs = Module._get_tablespace_page_costs = (e, t2, r) => (_get_tablespace_page_costs = Module._get_tablespace_page_costs = wasmExports.get_tablespace_page_costs)(e, t2, r), _cost_qual_eval = Module._cost_qual_eval = (e, t2, r) => (_cost_qual_eval = Module._cost_qual_eval = wasmExports.cost_qual_eval)(e, t2, r), _estimate_num_groups = Module._estimate_num_groups = (e, t2, r, a2, o4) => (_estimate_num_groups = Module._estimate_num_groups = wasmExports.estimate_num_groups)(e, t2, r, a2, o4), _cost_sort = Module._cost_sort = (e, t2, r, a2, o4, s4, n3, _3, l3) => (_cost_sort = Module._cost_sort = wasmExports.cost_sort)(e, t2, r, a2, o4, s4, n3, _3, l3), _get_sortgrouplist_exprs = Module._get_sortgrouplist_exprs = (e, t2) => (_get_sortgrouplist_exprs = Module._get_sortgrouplist_exprs = wasmExports.get_sortgrouplist_exprs)(e, t2), _make_restrictinfo = Module._make_restrictinfo = (e, t2, r, a2, o4, s4, n3, _3, l3, p4) => (_make_restrictinfo = Module._make_restrictinfo = wasmExports.make_restrictinfo)(e, t2, r, a2, o4, s4, n3, _3, l3, p4), _generate_implied_equalities_for_column = Module._generate_implied_equalities_for_column = (e, t2, r, a2, o4) => (_generate_implied_equalities_for_column = Module._generate_implied_equalities_for_column = wasmExports.generate_implied_equalities_for_column)(e, t2, r, a2, o4), _eclass_useful_for_merging = Module._eclass_useful_for_merging = (e, t2, r) => (_eclass_useful_for_merging = Module._eclass_useful_for_merging = wasmExports.eclass_useful_for_merging)(e, t2, r), _join_clause_is_movable_to = Module._join_clause_is_movable_to = (e, t2) => (_join_clause_is_movable_to = Module._join_clause_is_movable_to = wasmExports.join_clause_is_movable_to)(e, t2), _get_plan_rowmark = Module._get_plan_rowmark = (e, t2) => (_get_plan_rowmark = Module._get_plan_rowmark = wasmExports.get_plan_rowmark)(e, t2), _update_mergeclause_eclasses = Module._update_mergeclause_eclasses = (e, t2) => (_update_mergeclause_eclasses = Module._update_mergeclause_eclasses = wasmExports.update_mergeclause_eclasses)(e, t2), _find_join_rel = Module._find_join_rel = (e, t2) => (_find_join_rel = Module._find_join_rel = wasmExports.find_join_rel)(e, t2), _make_canonical_pathkey = Module._make_canonical_pathkey = (e, t2, r, a2, o4) => (_make_canonical_pathkey = Module._make_canonical_pathkey = wasmExports.make_canonical_pathkey)(e, t2, r, a2, o4), _get_sortgroupref_clause_noerr = Module._get_sortgroupref_clause_noerr = (e, t2) => (_get_sortgroupref_clause_noerr = Module._get_sortgroupref_clause_noerr = wasmExports.get_sortgroupref_clause_noerr)(e, t2), _extract_actual_clauses = Module._extract_actual_clauses = (e, t2) => (_extract_actual_clauses = Module._extract_actual_clauses = wasmExports.extract_actual_clauses)(e, t2), _change_plan_targetlist = Module._change_plan_targetlist = (e, t2, r) => (_change_plan_targetlist = Module._change_plan_targetlist = wasmExports.change_plan_targetlist)(e, t2, r), _make_foreignscan = Module._make_foreignscan = (e, t2, r, a2, o4, s4, n3, _3) => (_make_foreignscan = Module._make_foreignscan = wasmExports.make_foreignscan)(e, t2, r, a2, o4, s4, n3, _3), _tlist_member = Module._tlist_member = (e, t2) => (_tlist_member = Module._tlist_member = wasmExports.tlist_member)(e, t2), _pull_vars_of_level = Module._pull_vars_of_level = (e, t2) => (_pull_vars_of_level = Module._pull_vars_of_level = wasmExports.pull_vars_of_level)(e, t2), _IncrementVarSublevelsUp = Module._IncrementVarSublevelsUp = (e, t2, r) => (_IncrementVarSublevelsUp = Module._IncrementVarSublevelsUp = wasmExports.IncrementVarSublevelsUp)(e, t2, r), _standard_planner = Module._standard_planner = (e, t2, r, a2) => (_standard_planner = Module._standard_planner = wasmExports.standard_planner)(e, t2, r, a2), _get_relids_in_jointree = Module._get_relids_in_jointree = (e, t2, r) => (_get_relids_in_jointree = Module._get_relids_in_jointree = wasmExports.get_relids_in_jointree)(e, t2, r), _add_new_columns_to_pathtarget = Module._add_new_columns_to_pathtarget = (e, t2) => (_add_new_columns_to_pathtarget = Module._add_new_columns_to_pathtarget = wasmExports.add_new_columns_to_pathtarget)(e, t2), _get_agg_clause_costs = Module._get_agg_clause_costs = (e, t2, r) => (_get_agg_clause_costs = Module._get_agg_clause_costs = wasmExports.get_agg_clause_costs)(e, t2, r), _grouping_is_sortable = Module._grouping_is_sortable = (e) => (_grouping_is_sortable = Module._grouping_is_sortable = wasmExports.grouping_is_sortable)(e), _copy_pathtarget = Module._copy_pathtarget = (e) => (_copy_pathtarget = Module._copy_pathtarget = wasmExports.copy_pathtarget)(e), _create_projection_path = Module._create_projection_path = (e, t2, r, a2) => (_create_projection_path = Module._create_projection_path = wasmExports.create_projection_path)(e, t2, r, a2), _GetSysCacheHashValue = Module._GetSysCacheHashValue = (e, t2, r, a2, o4) => (_GetSysCacheHashValue = Module._GetSysCacheHashValue = wasmExports.GetSysCacheHashValue)(e, t2, r, a2, o4), _get_translated_update_targetlist = Module._get_translated_update_targetlist = (e, t2, r, a2) => (_get_translated_update_targetlist = Module._get_translated_update_targetlist = wasmExports.get_translated_update_targetlist)(e, t2, r, a2), _add_row_identity_var = Module._add_row_identity_var = (e, t2, r, a2) => (_add_row_identity_var = Module._add_row_identity_var = wasmExports.add_row_identity_var)(e, t2, r, a2), _get_rel_all_updated_cols = Module._get_rel_all_updated_cols = (e, t2) => (_get_rel_all_updated_cols = Module._get_rel_all_updated_cols = wasmExports.get_rel_all_updated_cols)(e, t2), _get_baserel_parampathinfo = Module._get_baserel_parampathinfo = (e, t2, r) => (_get_baserel_parampathinfo = Module._get_baserel_parampathinfo = wasmExports.get_baserel_parampathinfo)(e, t2, r), _create_foreignscan_path = Module._create_foreignscan_path = (e, t2, r, a2, o4, s4, n3, _3, l3, p4, m4) => (_create_foreignscan_path = Module._create_foreignscan_path = wasmExports.create_foreignscan_path)(e, t2, r, a2, o4, s4, n3, _3, l3, p4, m4), _create_foreign_join_path = Module._create_foreign_join_path = (e, t2, r, a2, o4, s4, n3, _3, l3, p4, m4) => (_create_foreign_join_path = Module._create_foreign_join_path = wasmExports.create_foreign_join_path)(e, t2, r, a2, o4, s4, n3, _3, l3, p4, m4), _create_foreign_upper_path = Module._create_foreign_upper_path = (e, t2, r, a2, o4, s4, n3, _3, l3, p4) => (_create_foreign_upper_path = Module._create_foreign_upper_path = wasmExports.create_foreign_upper_path)(e, t2, r, a2, o4, s4, n3, _3, l3, p4), _adjust_limit_rows_costs = Module._adjust_limit_rows_costs = (e, t2, r, a2, o4) => (_adjust_limit_rows_costs = Module._adjust_limit_rows_costs = wasmExports.adjust_limit_rows_costs)(e, t2, r, a2, o4), _add_to_flat_tlist = Module._add_to_flat_tlist = (e, t2) => (_add_to_flat_tlist = Module._add_to_flat_tlist = wasmExports.add_to_flat_tlist)(e, t2), _get_fn_expr_argtype = Module._get_fn_expr_argtype = (e, t2) => (_get_fn_expr_argtype = Module._get_fn_expr_argtype = wasmExports.get_fn_expr_argtype)(e, t2), _on_shmem_exit = Module._on_shmem_exit = (e, t2) => (_on_shmem_exit = Module._on_shmem_exit = wasmExports.on_shmem_exit)(e, t2), _SignalHandlerForConfigReload = Module._SignalHandlerForConfigReload = (e) => (_SignalHandlerForConfigReload = Module._SignalHandlerForConfigReload = wasmExports.SignalHandlerForConfigReload)(e), _SignalHandlerForShutdownRequest = Module._SignalHandlerForShutdownRequest = (e) => (_SignalHandlerForShutdownRequest = Module._SignalHandlerForShutdownRequest = wasmExports.SignalHandlerForShutdownRequest)(e), _procsignal_sigusr1_handler = Module._procsignal_sigusr1_handler = (e) => (_procsignal_sigusr1_handler = Module._procsignal_sigusr1_handler = wasmExports.procsignal_sigusr1_handler)(e), _RegisterBackgroundWorker = Module._RegisterBackgroundWorker = (e) => (_RegisterBackgroundWorker = Module._RegisterBackgroundWorker = wasmExports.RegisterBackgroundWorker)(e), _WaitForBackgroundWorkerStartup = Module._WaitForBackgroundWorkerStartup = (e, t2) => (_WaitForBackgroundWorkerStartup = Module._WaitForBackgroundWorkerStartup = wasmExports.WaitForBackgroundWorkerStartup)(e, t2), _GetConfigOption = Module._GetConfigOption = (e, t2, r) => (_GetConfigOption = Module._GetConfigOption = wasmExports.GetConfigOption)(e, t2, r), _toupper = Module._toupper = (e) => (_toupper = Module._toupper = wasmExports.toupper)(e), _pg_reg_getinitialstate = Module._pg_reg_getinitialstate = (e) => (_pg_reg_getinitialstate = Module._pg_reg_getinitialstate = wasmExports.pg_reg_getinitialstate)(e), _pg_reg_getfinalstate = Module._pg_reg_getfinalstate = (e) => (_pg_reg_getfinalstate = Module._pg_reg_getfinalstate = wasmExports.pg_reg_getfinalstate)(e), _pg_reg_getnumoutarcs = Module._pg_reg_getnumoutarcs = (e, t2) => (_pg_reg_getnumoutarcs = Module._pg_reg_getnumoutarcs = wasmExports.pg_reg_getnumoutarcs)(e, t2), _pg_reg_getoutarcs = Module._pg_reg_getoutarcs = (e, t2, r, a2) => (_pg_reg_getoutarcs = Module._pg_reg_getoutarcs = wasmExports.pg_reg_getoutarcs)(e, t2, r, a2), _pg_reg_getnumcolors = Module._pg_reg_getnumcolors = (e) => (_pg_reg_getnumcolors = Module._pg_reg_getnumcolors = wasmExports.pg_reg_getnumcolors)(e), _pg_reg_colorisbegin = Module._pg_reg_colorisbegin = (e, t2) => (_pg_reg_colorisbegin = Module._pg_reg_colorisbegin = wasmExports.pg_reg_colorisbegin)(e, t2), _pg_reg_colorisend = Module._pg_reg_colorisend = (e, t2) => (_pg_reg_colorisend = Module._pg_reg_colorisend = wasmExports.pg_reg_colorisend)(e, t2), _pg_reg_getnumcharacters = Module._pg_reg_getnumcharacters = (e, t2) => (_pg_reg_getnumcharacters = Module._pg_reg_getnumcharacters = wasmExports.pg_reg_getnumcharacters)(e, t2), _pg_reg_getcharacters = Module._pg_reg_getcharacters = (e, t2, r, a2) => (_pg_reg_getcharacters = Module._pg_reg_getcharacters = wasmExports.pg_reg_getcharacters)(e, t2, r, a2), _OutputPluginPrepareWrite = Module._OutputPluginPrepareWrite = (e, t2) => (_OutputPluginPrepareWrite = Module._OutputPluginPrepareWrite = wasmExports.OutputPluginPrepareWrite)(e, t2), _OutputPluginWrite = Module._OutputPluginWrite = (e, t2) => (_OutputPluginWrite = Module._OutputPluginWrite = wasmExports.OutputPluginWrite)(e, t2), _array_contains_nulls = Module._array_contains_nulls = (e) => (_array_contains_nulls = Module._array_contains_nulls = wasmExports.array_contains_nulls)(e), _hash_seq_term = Module._hash_seq_term = (e) => (_hash_seq_term = Module._hash_seq_term = wasmExports.hash_seq_term)(e), _FreeErrorData = Module._FreeErrorData = (e) => (_FreeErrorData = Module._FreeErrorData = wasmExports.FreeErrorData)(e), _RelidByRelfilenumber = Module._RelidByRelfilenumber = (e, t2) => (_RelidByRelfilenumber = Module._RelidByRelfilenumber = wasmExports.RelidByRelfilenumber)(e, t2), _WaitLatchOrSocket = Module._WaitLatchOrSocket = (e, t2, r, a2, o4) => (_WaitLatchOrSocket = Module._WaitLatchOrSocket = wasmExports.WaitLatchOrSocket)(e, t2, r, a2, o4), _get_row_security_policies = Module._get_row_security_policies = (e, t2, r, a2, o4, s4, n3) => (_get_row_security_policies = Module._get_row_security_policies = wasmExports.get_row_security_policies)(e, t2, r, a2, o4, s4, n3), _hash_estimate_size = Module._hash_estimate_size = (e, t2) => (_hash_estimate_size = Module._hash_estimate_size = wasmExports.hash_estimate_size)(e, t2), _ShmemInitHash = Module._ShmemInitHash = (e, t2, r, a2, o4) => (_ShmemInitHash = Module._ShmemInitHash = wasmExports.ShmemInitHash)(e, t2, r, a2, o4), _LockBufHdr = Module._LockBufHdr = (e) => (_LockBufHdr = Module._LockBufHdr = wasmExports.LockBufHdr)(e), _EvictUnpinnedBuffer = Module._EvictUnpinnedBuffer = (e) => (_EvictUnpinnedBuffer = Module._EvictUnpinnedBuffer = wasmExports.EvictUnpinnedBuffer)(e), _have_free_buffer = Module._have_free_buffer = () => (_have_free_buffer = Module._have_free_buffer = wasmExports.have_free_buffer)(), _copy_file = Module._copy_file = (e, t2) => (_copy_file = Module._copy_file = wasmExports.copy_file)(e, t2), _AcquireExternalFD = Module._AcquireExternalFD = () => (_AcquireExternalFD = Module._AcquireExternalFD = wasmExports.AcquireExternalFD)(), _GetNamedDSMSegment = Module._GetNamedDSMSegment = (e, t2, r, a2) => (_GetNamedDSMSegment = Module._GetNamedDSMSegment = wasmExports.GetNamedDSMSegment)(e, t2, r, a2), _RequestAddinShmemSpace = Module._RequestAddinShmemSpace = (e) => (_RequestAddinShmemSpace = Module._RequestAddinShmemSpace = wasmExports.RequestAddinShmemSpace)(e), _GetRunningTransactionData = Module._GetRunningTransactionData = () => (_GetRunningTransactionData = Module._GetRunningTransactionData = wasmExports.GetRunningTransactionData)(), _BackendXidGetPid = Module._BackendXidGetPid = (e) => (_BackendXidGetPid = Module._BackendXidGetPid = wasmExports.BackendXidGetPid)(e), _LWLockRegisterTranche = Module._LWLockRegisterTranche = (e, t2) => (_LWLockRegisterTranche = Module._LWLockRegisterTranche = wasmExports.LWLockRegisterTranche)(e, t2), _GetNamedLWLockTranche = Module._GetNamedLWLockTranche = (e) => (_GetNamedLWLockTranche = Module._GetNamedLWLockTranche = wasmExports.GetNamedLWLockTranche)(e), _LWLockNewTrancheId = Module._LWLockNewTrancheId = () => (_LWLockNewTrancheId = Module._LWLockNewTrancheId = wasmExports.LWLockNewTrancheId)(), _RequestNamedLWLockTranche = Module._RequestNamedLWLockTranche = (e, t2) => (_RequestNamedLWLockTranche = Module._RequestNamedLWLockTranche = wasmExports.RequestNamedLWLockTranche)(e, t2), _standard_ProcessUtility = Module._standard_ProcessUtility = (e, t2, r, a2, o4, s4, n3, _3) => (_standard_ProcessUtility = Module._standard_ProcessUtility = wasmExports.standard_ProcessUtility)(e, t2, r, a2, o4, s4, n3, _3), _lookup_ts_dictionary_cache = Module._lookup_ts_dictionary_cache = (e) => (_lookup_ts_dictionary_cache = Module._lookup_ts_dictionary_cache = wasmExports.lookup_ts_dictionary_cache)(e), _get_tsearch_config_filename = Module._get_tsearch_config_filename = (e, t2) => (_get_tsearch_config_filename = Module._get_tsearch_config_filename = wasmExports.get_tsearch_config_filename)(e, t2), _lowerstr = Module._lowerstr = (e) => (_lowerstr = Module._lowerstr = wasmExports.lowerstr)(e), _readstoplist = Module._readstoplist = (e, t2, r) => (_readstoplist = Module._readstoplist = wasmExports.readstoplist)(e, t2, r), _lowerstr_with_len = Module._lowerstr_with_len = (e, t2) => (_lowerstr_with_len = Module._lowerstr_with_len = wasmExports.lowerstr_with_len)(e, t2), _searchstoplist = Module._searchstoplist = (e, t2) => (_searchstoplist = Module._searchstoplist = wasmExports.searchstoplist)(e, t2), _tsearch_readline_begin = Module._tsearch_readline_begin = (e, t2) => (_tsearch_readline_begin = Module._tsearch_readline_begin = wasmExports.tsearch_readline_begin)(e, t2), _tsearch_readline = Module._tsearch_readline = (e) => (_tsearch_readline = Module._tsearch_readline = wasmExports.tsearch_readline)(e), _t_isspace = Module._t_isspace = (e) => (_t_isspace = Module._t_isspace = wasmExports.t_isspace)(e), _tsearch_readline_end = Module._tsearch_readline_end = (e) => (_tsearch_readline_end = Module._tsearch_readline_end = wasmExports.tsearch_readline_end)(e), _stringToQualifiedNameList = Module._stringToQualifiedNameList = (e, t2) => (_stringToQualifiedNameList = Module._stringToQualifiedNameList = wasmExports.stringToQualifiedNameList)(e, t2), _t_isdigit = Module._t_isdigit = (e) => (_t_isdigit = Module._t_isdigit = wasmExports.t_isdigit)(e), _t_isalnum = Module._t_isalnum = (e) => (_t_isalnum = Module._t_isalnum = wasmExports.t_isalnum)(e), _get_restriction_variable = Module._get_restriction_variable = (e, t2, r, a2, o4, s4) => (_get_restriction_variable = Module._get_restriction_variable = wasmExports.get_restriction_variable)(e, t2, r, a2, o4, s4), _MemoryContextAllocHuge = Module._MemoryContextAllocHuge = (e, t2) => (_MemoryContextAllocHuge = Module._MemoryContextAllocHuge = wasmExports.MemoryContextAllocHuge)(e, t2), _WaitEventExtensionNew = Module._WaitEventExtensionNew = (e) => (_WaitEventExtensionNew = Module._WaitEventExtensionNew = wasmExports.WaitEventExtensionNew)(e), _expand_array = Module._expand_array = (e, t2, r) => (_expand_array = Module._expand_array = wasmExports.expand_array)(e, t2, r), _arraycontsel = Module._arraycontsel = (e) => (_arraycontsel = Module._arraycontsel = wasmExports.arraycontsel)(e), _arraycontjoinsel = Module._arraycontjoinsel = (e) => (_arraycontjoinsel = Module._arraycontjoinsel = wasmExports.arraycontjoinsel)(e), _initArrayResult = Module._initArrayResult = (e, t2, r) => (_initArrayResult = Module._initArrayResult = wasmExports.initArrayResult)(e, t2, r), _array_create_iterator = Module._array_create_iterator = (e, t2, r) => (_array_create_iterator = Module._array_create_iterator = wasmExports.array_create_iterator)(e, t2, r), _array_iterate = Module._array_iterate = (e, t2, r) => (_array_iterate = Module._array_iterate = wasmExports.array_iterate)(e, t2, r), _ArrayGetIntegerTypmods = Module._ArrayGetIntegerTypmods = (e, t2) => (_ArrayGetIntegerTypmods = Module._ArrayGetIntegerTypmods = wasmExports.ArrayGetIntegerTypmods)(e, t2), _boolin = Module._boolin = (e) => (_boolin = Module._boolin = wasmExports.boolin)(e), _cash_cmp = Module._cash_cmp = (e) => (_cash_cmp = Module._cash_cmp = wasmExports.cash_cmp)(e), _int64_to_numeric = Module._int64_to_numeric = (e) => (_int64_to_numeric = Module._int64_to_numeric = wasmExports.int64_to_numeric)(e), _numeric_div = Module._numeric_div = (e) => (_numeric_div = Module._numeric_div = wasmExports.numeric_div)(e), _date_eq = Module._date_eq = (e) => (_date_eq = Module._date_eq = wasmExports.date_eq)(e), _date_lt = Module._date_lt = (e) => (_date_lt = Module._date_lt = wasmExports.date_lt)(e), _date_le = Module._date_le = (e) => (_date_le = Module._date_le = wasmExports.date_le)(e), _date_gt = Module._date_gt = (e) => (_date_gt = Module._date_gt = wasmExports.date_gt)(e), _date_ge = Module._date_ge = (e) => (_date_ge = Module._date_ge = wasmExports.date_ge)(e), _date_cmp = Module._date_cmp = (e) => (_date_cmp = Module._date_cmp = wasmExports.date_cmp)(e), _date_mi = Module._date_mi = (e) => (_date_mi = Module._date_mi = wasmExports.date_mi)(e), _time_eq = Module._time_eq = (e) => (_time_eq = Module._time_eq = wasmExports.time_eq)(e), _time_lt = Module._time_lt = (e) => (_time_lt = Module._time_lt = wasmExports.time_lt)(e), _time_le = Module._time_le = (e) => (_time_le = Module._time_le = wasmExports.time_le)(e), _time_gt = Module._time_gt = (e) => (_time_gt = Module._time_gt = wasmExports.time_gt)(e), _time_ge = Module._time_ge = (e) => (_time_ge = Module._time_ge = wasmExports.time_ge)(e), _time_cmp = Module._time_cmp = (e) => (_time_cmp = Module._time_cmp = wasmExports.time_cmp)(e), _time_mi_time = Module._time_mi_time = (e) => (_time_mi_time = Module._time_mi_time = wasmExports.time_mi_time)(e), _timetz_cmp = Module._timetz_cmp = (e) => (_timetz_cmp = Module._timetz_cmp = wasmExports.timetz_cmp)(e), _TransferExpandedObject = Module._TransferExpandedObject = (e, t2) => (_TransferExpandedObject = Module._TransferExpandedObject = wasmExports.TransferExpandedObject)(e, t2), _numeric_lt = Module._numeric_lt = (e) => (_numeric_lt = Module._numeric_lt = wasmExports.numeric_lt)(e), _numeric_ge = Module._numeric_ge = (e) => (_numeric_ge = Module._numeric_ge = wasmExports.numeric_ge)(e), _err_generic_string = Module._err_generic_string = (e, t2) => (_err_generic_string = Module._err_generic_string = wasmExports.err_generic_string)(e, t2), _domain_check = Module._domain_check = (e, t2, r, a2, o4) => (_domain_check = Module._domain_check = wasmExports.domain_check)(e, t2, r, a2, o4), _enum_lt = Module._enum_lt = (e) => (_enum_lt = Module._enum_lt = wasmExports.enum_lt)(e), _enum_le = Module._enum_le = (e) => (_enum_le = Module._enum_le = wasmExports.enum_le)(e), _enum_ge = Module._enum_ge = (e) => (_enum_ge = Module._enum_ge = wasmExports.enum_ge)(e), _enum_gt = Module._enum_gt = (e) => (_enum_gt = Module._enum_gt = wasmExports.enum_gt)(e), _enum_cmp = Module._enum_cmp = (e) => (_enum_cmp = Module._enum_cmp = wasmExports.enum_cmp)(e), _make_expanded_record_from_typeid = Module._make_expanded_record_from_typeid = (e, t2, r) => (_make_expanded_record_from_typeid = Module._make_expanded_record_from_typeid = wasmExports.make_expanded_record_from_typeid)(e, t2, r), _make_expanded_record_from_tupdesc = Module._make_expanded_record_from_tupdesc = (e, t2) => (_make_expanded_record_from_tupdesc = Module._make_expanded_record_from_tupdesc = wasmExports.make_expanded_record_from_tupdesc)(e, t2), _make_expanded_record_from_exprecord = Module._make_expanded_record_from_exprecord = (e, t2) => (_make_expanded_record_from_exprecord = Module._make_expanded_record_from_exprecord = wasmExports.make_expanded_record_from_exprecord)(e, t2), _expanded_record_set_tuple = Module._expanded_record_set_tuple = (e, t2, r, a2) => (_expanded_record_set_tuple = Module._expanded_record_set_tuple = wasmExports.expanded_record_set_tuple)(e, t2, r, a2), _expanded_record_get_tuple = Module._expanded_record_get_tuple = (e) => (_expanded_record_get_tuple = Module._expanded_record_get_tuple = wasmExports.expanded_record_get_tuple)(e), _deconstruct_expanded_record = Module._deconstruct_expanded_record = (e) => (_deconstruct_expanded_record = Module._deconstruct_expanded_record = wasmExports.deconstruct_expanded_record)(e), _expanded_record_lookup_field = Module._expanded_record_lookup_field = (e, t2, r) => (_expanded_record_lookup_field = Module._expanded_record_lookup_field = wasmExports.expanded_record_lookup_field)(e, t2, r), _expanded_record_set_field_internal = Module._expanded_record_set_field_internal = (e, t2, r, a2, o4, s4) => (_expanded_record_set_field_internal = Module._expanded_record_set_field_internal = wasmExports.expanded_record_set_field_internal)(e, t2, r, a2, o4, s4), _expanded_record_set_fields = Module._expanded_record_set_fields = (e, t2, r, a2) => (_expanded_record_set_fields = Module._expanded_record_set_fields = wasmExports.expanded_record_set_fields)(e, t2, r, a2), _float4in_internal = Module._float4in_internal = (e, t2, r, a2, o4) => (_float4in_internal = Module._float4in_internal = wasmExports.float4in_internal)(e, t2, r, a2, o4), _strtof = Module._strtof = (e, t2) => (_strtof = Module._strtof = wasmExports.strtof)(e, t2), _float8in_internal = Module._float8in_internal = (e, t2, r, a2, o4) => (_float8in_internal = Module._float8in_internal = wasmExports.float8in_internal)(e, t2, r, a2, o4), _float8out_internal = Module._float8out_internal = (e) => (_float8out_internal = Module._float8out_internal = wasmExports.float8out_internal)(e), _btfloat4cmp = Module._btfloat4cmp = (e) => (_btfloat4cmp = Module._btfloat4cmp = wasmExports.btfloat4cmp)(e), _btfloat8cmp = Module._btfloat8cmp = (e) => (_btfloat8cmp = Module._btfloat8cmp = wasmExports.btfloat8cmp)(e), _acos = Module._acos = (e) => (_acos = Module._acos = wasmExports.acos)(e), _asin = Module._asin = (e) => (_asin = Module._asin = wasmExports.asin)(e), _cos = Module._cos = (e) => (_cos = Module._cos = wasmExports.cos)(e), _str_tolower = Module._str_tolower = (e, t2, r) => (_str_tolower = Module._str_tolower = wasmExports.str_tolower)(e, t2, r), _pushJsonbValue = Module._pushJsonbValue = (e, t2, r) => (_pushJsonbValue = Module._pushJsonbValue = wasmExports.pushJsonbValue)(e, t2, r), _numeric_float4 = Module._numeric_float4 = (e) => (_numeric_float4 = Module._numeric_float4 = wasmExports.numeric_float4)(e), _numeric_cmp = Module._numeric_cmp = (e) => (_numeric_cmp = Module._numeric_cmp = wasmExports.numeric_cmp)(e), _numeric_eq = Module._numeric_eq = (e) => (_numeric_eq = Module._numeric_eq = wasmExports.numeric_eq)(e), _numeric_is_nan = Module._numeric_is_nan = (e) => (_numeric_is_nan = Module._numeric_is_nan = wasmExports.numeric_is_nan)(e), _timestamp_cmp = Module._timestamp_cmp = (e) => (_timestamp_cmp = Module._timestamp_cmp = wasmExports.timestamp_cmp)(e), _macaddr_cmp = Module._macaddr_cmp = (e) => (_macaddr_cmp = Module._macaddr_cmp = wasmExports.macaddr_cmp)(e), _macaddr_lt = Module._macaddr_lt = (e) => (_macaddr_lt = Module._macaddr_lt = wasmExports.macaddr_lt)(e), _macaddr_le = Module._macaddr_le = (e) => (_macaddr_le = Module._macaddr_le = wasmExports.macaddr_le)(e), _macaddr_eq = Module._macaddr_eq = (e) => (_macaddr_eq = Module._macaddr_eq = wasmExports.macaddr_eq)(e), _macaddr_ge = Module._macaddr_ge = (e) => (_macaddr_ge = Module._macaddr_ge = wasmExports.macaddr_ge)(e), _macaddr_gt = Module._macaddr_gt = (e) => (_macaddr_gt = Module._macaddr_gt = wasmExports.macaddr_gt)(e), _macaddr8_cmp = Module._macaddr8_cmp = (e) => (_macaddr8_cmp = Module._macaddr8_cmp = wasmExports.macaddr8_cmp)(e), _macaddr8_lt = Module._macaddr8_lt = (e) => (_macaddr8_lt = Module._macaddr8_lt = wasmExports.macaddr8_lt)(e), _macaddr8_le = Module._macaddr8_le = (e) => (_macaddr8_le = Module._macaddr8_le = wasmExports.macaddr8_le)(e), _macaddr8_eq = Module._macaddr8_eq = (e) => (_macaddr8_eq = Module._macaddr8_eq = wasmExports.macaddr8_eq)(e), _macaddr8_ge = Module._macaddr8_ge = (e) => (_macaddr8_ge = Module._macaddr8_ge = wasmExports.macaddr8_ge)(e), _macaddr8_gt = Module._macaddr8_gt = (e) => (_macaddr8_gt = Module._macaddr8_gt = wasmExports.macaddr8_gt)(e), _current_query = Module._current_query = (e) => (_current_query = Module._current_query = wasmExports.current_query)(e), _unpack_sql_state = Module._unpack_sql_state = (e) => (_unpack_sql_state = Module._unpack_sql_state = wasmExports.unpack_sql_state)(e), _get_fn_expr_rettype = Module._get_fn_expr_rettype = (e) => (_get_fn_expr_rettype = Module._get_fn_expr_rettype = wasmExports.get_fn_expr_rettype)(e), _btnamecmp = Module._btnamecmp = (e) => (_btnamecmp = Module._btnamecmp = wasmExports.btnamecmp)(e), _inet_in = Module._inet_in = (e) => (_inet_in = Module._inet_in = wasmExports.inet_in)(e), _network_cmp = Module._network_cmp = (e) => (_network_cmp = Module._network_cmp = wasmExports.network_cmp)(e), _convert_network_to_scalar = Module._convert_network_to_scalar = (e, t2, r) => (_convert_network_to_scalar = Module._convert_network_to_scalar = wasmExports.convert_network_to_scalar)(e, t2, r), _numeric_gt = Module._numeric_gt = (e) => (_numeric_gt = Module._numeric_gt = wasmExports.numeric_gt)(e), _numeric_le = Module._numeric_le = (e) => (_numeric_le = Module._numeric_le = wasmExports.numeric_le)(e), _numeric_float8_no_overflow = Module._numeric_float8_no_overflow = (e) => (_numeric_float8_no_overflow = Module._numeric_float8_no_overflow = wasmExports.numeric_float8_no_overflow)(e), _oidout = Module._oidout = (e) => (_oidout = Module._oidout = wasmExports.oidout)(e), _interval_mi = Module._interval_mi = (e) => (_interval_mi = Module._interval_mi = wasmExports.interval_mi)(e), _quote_ident = Module._quote_ident = (e) => (_quote_ident = Module._quote_ident = wasmExports.quote_ident)(e), _pg_wchar2mb_with_len = Module._pg_wchar2mb_with_len = (e, t2, r) => (_pg_wchar2mb_with_len = Module._pg_wchar2mb_with_len = wasmExports.pg_wchar2mb_with_len)(e, t2, r), _pg_get_indexdef_columns_extended = Module._pg_get_indexdef_columns_extended = (e, t2) => (_pg_get_indexdef_columns_extended = Module._pg_get_indexdef_columns_extended = wasmExports.pg_get_indexdef_columns_extended)(e, t2), _pg_get_querydef = Module._pg_get_querydef = (e, t2) => (_pg_get_querydef = Module._pg_get_querydef = wasmExports.pg_get_querydef)(e, t2), _strcspn = Module._strcspn = (e, t2) => (_strcspn = Module._strcspn = wasmExports.strcspn)(e, t2), _generic_restriction_selectivity = Module._generic_restriction_selectivity = (e, t2, r, a2, o4, s4) => (_generic_restriction_selectivity = Module._generic_restriction_selectivity = wasmExports.generic_restriction_selectivity)(e, t2, r, a2, o4, s4), _genericcostestimate = Module._genericcostestimate = (e, t2, r, a2) => (_genericcostestimate = Module._genericcostestimate = wasmExports.genericcostestimate)(e, t2, r, a2), _tidin = Module._tidin = (e) => (_tidin = Module._tidin = wasmExports.tidin)(e), _tidout = Module._tidout = (e) => (_tidout = Module._tidout = wasmExports.tidout)(e), _timestamp_in = Module._timestamp_in = (e) => (_timestamp_in = Module._timestamp_in = wasmExports.timestamp_in)(e), _timestamp_eq = Module._timestamp_eq = (e) => (_timestamp_eq = Module._timestamp_eq = wasmExports.timestamp_eq)(e), _timestamp_lt = Module._timestamp_lt = (e) => (_timestamp_lt = Module._timestamp_lt = wasmExports.timestamp_lt)(e), _timestamp_gt = Module._timestamp_gt = (e) => (_timestamp_gt = Module._timestamp_gt = wasmExports.timestamp_gt)(e), _timestamp_le = Module._timestamp_le = (e) => (_timestamp_le = Module._timestamp_le = wasmExports.timestamp_le)(e), _timestamp_ge = Module._timestamp_ge = (e) => (_timestamp_ge = Module._timestamp_ge = wasmExports.timestamp_ge)(e), _interval_eq = Module._interval_eq = (e) => (_interval_eq = Module._interval_eq = wasmExports.interval_eq)(e), _interval_lt = Module._interval_lt = (e) => (_interval_lt = Module._interval_lt = wasmExports.interval_lt)(e), _interval_gt = Module._interval_gt = (e) => (_interval_gt = Module._interval_gt = wasmExports.interval_gt)(e), _interval_le = Module._interval_le = (e) => (_interval_le = Module._interval_le = wasmExports.interval_le)(e), _interval_ge = Module._interval_ge = (e) => (_interval_ge = Module._interval_ge = wasmExports.interval_ge)(e), _interval_cmp = Module._interval_cmp = (e) => (_interval_cmp = Module._interval_cmp = wasmExports.interval_cmp)(e), _timestamp_mi = Module._timestamp_mi = (e) => (_timestamp_mi = Module._timestamp_mi = wasmExports.timestamp_mi)(e), _interval_um = Module._interval_um = (e) => (_interval_um = Module._interval_um = wasmExports.interval_um)(e), _has_fn_opclass_options = Module._has_fn_opclass_options = (e) => (_has_fn_opclass_options = Module._has_fn_opclass_options = wasmExports.has_fn_opclass_options)(e), _uuid_in = Module._uuid_in = (e) => (_uuid_in = Module._uuid_in = wasmExports.uuid_in)(e), _uuid_out = Module._uuid_out = (e) => (_uuid_out = Module._uuid_out = wasmExports.uuid_out)(e), _uuid_cmp = Module._uuid_cmp = (e) => (_uuid_cmp = Module._uuid_cmp = wasmExports.uuid_cmp)(e), _gen_random_uuid = Module._gen_random_uuid = (e) => (_gen_random_uuid = Module._gen_random_uuid = wasmExports.gen_random_uuid)(e), _varbit_in = Module._varbit_in = (e) => (_varbit_in = Module._varbit_in = wasmExports.varbit_in)(e), _biteq = Module._biteq = (e) => (_biteq = Module._biteq = wasmExports.biteq)(e), _bitlt = Module._bitlt = (e) => (_bitlt = Module._bitlt = wasmExports.bitlt)(e), _bitle = Module._bitle = (e) => (_bitle = Module._bitle = wasmExports.bitle)(e), _bitgt = Module._bitgt = (e) => (_bitgt = Module._bitgt = wasmExports.bitgt)(e), _bitge = Module._bitge = (e) => (_bitge = Module._bitge = wasmExports.bitge)(e), _bitcmp = Module._bitcmp = (e) => (_bitcmp = Module._bitcmp = wasmExports.bitcmp)(e), _bpchareq = Module._bpchareq = (e) => (_bpchareq = Module._bpchareq = wasmExports.bpchareq)(e), _bpcharlt = Module._bpcharlt = (e) => (_bpcharlt = Module._bpcharlt = wasmExports.bpcharlt)(e), _bpcharle = Module._bpcharle = (e) => (_bpcharle = Module._bpcharle = wasmExports.bpcharle)(e), _bpchargt = Module._bpchargt = (e) => (_bpchargt = Module._bpchargt = wasmExports.bpchargt)(e), _bpcharge = Module._bpcharge = (e) => (_bpcharge = Module._bpcharge = wasmExports.bpcharge)(e), _bpcharcmp = Module._bpcharcmp = (e) => (_bpcharcmp = Module._bpcharcmp = wasmExports.bpcharcmp)(e), _texteq = Module._texteq = (e) => (_texteq = Module._texteq = wasmExports.texteq)(e), _text_lt = Module._text_lt = (e) => (_text_lt = Module._text_lt = wasmExports.text_lt)(e), _text_le = Module._text_le = (e) => (_text_le = Module._text_le = wasmExports.text_le)(e), _text_gt = Module._text_gt = (e) => (_text_gt = Module._text_gt = wasmExports.text_gt)(e), _text_ge = Module._text_ge = (e) => (_text_ge = Module._text_ge = wasmExports.text_ge)(e), _bttextcmp = Module._bttextcmp = (e) => (_bttextcmp = Module._bttextcmp = wasmExports.bttextcmp)(e), _byteaeq = Module._byteaeq = (e) => (_byteaeq = Module._byteaeq = wasmExports.byteaeq)(e), _bytealt = Module._bytealt = (e) => (_bytealt = Module._bytealt = wasmExports.bytealt)(e), _byteale = Module._byteale = (e) => (_byteale = Module._byteale = wasmExports.byteale)(e), _byteagt = Module._byteagt = (e) => (_byteagt = Module._byteagt = wasmExports.byteagt)(e), _byteage = Module._byteage = (e) => (_byteage = Module._byteage = wasmExports.byteage)(e), _byteacmp = Module._byteacmp = (e) => (_byteacmp = Module._byteacmp = wasmExports.byteacmp)(e), _to_hex32 = Module._to_hex32 = (e) => (_to_hex32 = Module._to_hex32 = wasmExports.to_hex32)(e), _varstr_levenshtein = Module._varstr_levenshtein = (e, t2, r, a2, o4, s4, n3, _3) => (_varstr_levenshtein = Module._varstr_levenshtein = wasmExports.varstr_levenshtein)(e, t2, r, a2, o4, s4, n3, _3), _pg_xml_init = Module._pg_xml_init = (e) => (_pg_xml_init = Module._pg_xml_init = wasmExports.pg_xml_init)(e), _xmlInitParser = Module._xmlInitParser = () => (_xmlInitParser = Module._xmlInitParser = wasmExports.xmlInitParser)(), _xml_ereport = Module._xml_ereport = (e, t2, r, a2) => (_xml_ereport = Module._xml_ereport = wasmExports.xml_ereport)(e, t2, r, a2), _pg_xml_done = Module._pg_xml_done = (e, t2) => (_pg_xml_done = Module._pg_xml_done = wasmExports.pg_xml_done)(e, t2), _xmlXPathNewContext = Module._xmlXPathNewContext = (e) => (_xmlXPathNewContext = Module._xmlXPathNewContext = wasmExports.xmlXPathNewContext)(e), _xmlXPathFreeContext = Module._xmlXPathFreeContext = (e) => (_xmlXPathFreeContext = Module._xmlXPathFreeContext = wasmExports.xmlXPathFreeContext)(e), _xmlFreeDoc = Module._xmlFreeDoc = (e) => (_xmlFreeDoc = Module._xmlFreeDoc = wasmExports.xmlFreeDoc)(e), _xmlXPathCtxtCompile = Module._xmlXPathCtxtCompile = (e, t2) => (_xmlXPathCtxtCompile = Module._xmlXPathCtxtCompile = wasmExports.xmlXPathCtxtCompile)(e, t2), _xmlXPathCompiledEval = Module._xmlXPathCompiledEval = (e, t2) => (_xmlXPathCompiledEval = Module._xmlXPathCompiledEval = wasmExports.xmlXPathCompiledEval)(e, t2), _xmlXPathFreeObject = Module._xmlXPathFreeObject = (e) => (_xmlXPathFreeObject = Module._xmlXPathFreeObject = wasmExports.xmlXPathFreeObject)(e), _xmlXPathFreeCompExpr = Module._xmlXPathFreeCompExpr = (e) => (_xmlXPathFreeCompExpr = Module._xmlXPathFreeCompExpr = wasmExports.xmlXPathFreeCompExpr)(e), _pg_do_encoding_conversion = Module._pg_do_encoding_conversion = (e, t2, r, a2) => (_pg_do_encoding_conversion = Module._pg_do_encoding_conversion = wasmExports.pg_do_encoding_conversion)(e, t2, r, a2), _xmlStrdup = Module._xmlStrdup = (e) => (_xmlStrdup = Module._xmlStrdup = wasmExports.xmlStrdup)(e), _xmlEncodeSpecialChars = Module._xmlEncodeSpecialChars = (e, t2) => (_xmlEncodeSpecialChars = Module._xmlEncodeSpecialChars = wasmExports.xmlEncodeSpecialChars)(e, t2), _xmlStrlen = Module._xmlStrlen = (e) => (_xmlStrlen = Module._xmlStrlen = wasmExports.xmlStrlen)(e), _xmlBufferCreate = Module._xmlBufferCreate = () => (_xmlBufferCreate = Module._xmlBufferCreate = wasmExports.xmlBufferCreate)(), _xmlBufferFree = Module._xmlBufferFree = (e) => (_xmlBufferFree = Module._xmlBufferFree = wasmExports.xmlBufferFree)(e), _xmlXPathCastNodeToString = Module._xmlXPathCastNodeToString = (e) => (_xmlXPathCastNodeToString = Module._xmlXPathCastNodeToString = wasmExports.xmlXPathCastNodeToString)(e), _xmlNodeDump = Module._xmlNodeDump = (e, t2, r, a2, o4) => (_xmlNodeDump = Module._xmlNodeDump = wasmExports.xmlNodeDump)(e, t2, r, a2, o4), _get_typsubscript = Module._get_typsubscript = (e, t2) => (_get_typsubscript = Module._get_typsubscript = wasmExports.get_typsubscript)(e, t2), _CachedPlanAllowsSimpleValidityCheck = Module._CachedPlanAllowsSimpleValidityCheck = (e, t2, r) => (_CachedPlanAllowsSimpleValidityCheck = Module._CachedPlanAllowsSimpleValidityCheck = wasmExports.CachedPlanAllowsSimpleValidityCheck)(e, t2, r), _CachedPlanIsSimplyValid = Module._CachedPlanIsSimplyValid = (e, t2, r) => (_CachedPlanIsSimplyValid = Module._CachedPlanIsSimplyValid = wasmExports.CachedPlanIsSimplyValid)(e, t2, r), _GetCachedExpression = Module._GetCachedExpression = (e) => (_GetCachedExpression = Module._GetCachedExpression = wasmExports.GetCachedExpression)(e), _FreeCachedExpression = Module._FreeCachedExpression = (e) => (_FreeCachedExpression = Module._FreeCachedExpression = wasmExports.FreeCachedExpression)(e), _ReleaseAllPlanCacheRefsInOwner = Module._ReleaseAllPlanCacheRefsInOwner = (e) => (_ReleaseAllPlanCacheRefsInOwner = Module._ReleaseAllPlanCacheRefsInOwner = wasmExports.ReleaseAllPlanCacheRefsInOwner)(e), _in_error_recursion_trouble = Module._in_error_recursion_trouble = () => (_in_error_recursion_trouble = Module._in_error_recursion_trouble = wasmExports.in_error_recursion_trouble)(), _GetErrorContextStack = Module._GetErrorContextStack = () => (_GetErrorContextStack = Module._GetErrorContextStack = wasmExports.GetErrorContextStack)(), _find_rendezvous_variable = Module._find_rendezvous_variable = (e) => (_find_rendezvous_variable = Module._find_rendezvous_variable = wasmExports.find_rendezvous_variable)(e), _CallerFInfoFunctionCall2 = Module._CallerFInfoFunctionCall2 = (e, t2, r, a2, o4) => (_CallerFInfoFunctionCall2 = Module._CallerFInfoFunctionCall2 = wasmExports.CallerFInfoFunctionCall2)(e, t2, r, a2, o4), _FunctionCall0Coll = Module._FunctionCall0Coll = (e, t2) => (_FunctionCall0Coll = Module._FunctionCall0Coll = wasmExports.FunctionCall0Coll)(e, t2), _resolve_polymorphic_argtypes = Module._resolve_polymorphic_argtypes = (e, t2, r, a2) => (_resolve_polymorphic_argtypes = Module._resolve_polymorphic_argtypes = wasmExports.resolve_polymorphic_argtypes)(e, t2, r, a2), _pg_bindtextdomain = Module._pg_bindtextdomain = (e) => (_pg_bindtextdomain = Module._pg_bindtextdomain = wasmExports.pg_bindtextdomain)(e), _DefineCustomBoolVariable = Module._DefineCustomBoolVariable = (e, t2, r, a2, o4, s4, n3, _3, l3, p4) => (_DefineCustomBoolVariable = Module._DefineCustomBoolVariable = wasmExports.DefineCustomBoolVariable)(e, t2, r, a2, o4, s4, n3, _3, l3, p4), _DefineCustomIntVariable = Module._DefineCustomIntVariable = (e, t2, r, a2, o4, s4, n3, _3, l3, p4, m4, d2) => (_DefineCustomIntVariable = Module._DefineCustomIntVariable = wasmExports.DefineCustomIntVariable)(e, t2, r, a2, o4, s4, n3, _3, l3, p4, m4, d2), _DefineCustomRealVariable = Module._DefineCustomRealVariable = (e, t2, r, a2, o4, s4, n3, _3, l3, p4, m4, d2) => (_DefineCustomRealVariable = Module._DefineCustomRealVariable = wasmExports.DefineCustomRealVariable)(e, t2, r, a2, o4, s4, n3, _3, l3, p4, m4, d2), _DefineCustomStringVariable = Module._DefineCustomStringVariable = (e, t2, r, a2, o4, s4, n3, _3, l3, p4) => (_DefineCustomStringVariable = Module._DefineCustomStringVariable = wasmExports.DefineCustomStringVariable)(e, t2, r, a2, o4, s4, n3, _3, l3, p4), _DefineCustomEnumVariable = Module._DefineCustomEnumVariable = (e, t2, r, a2, o4, s4, n3, _3, l3, p4, m4) => (_DefineCustomEnumVariable = Module._DefineCustomEnumVariable = wasmExports.DefineCustomEnumVariable)(e, t2, r, a2, o4, s4, n3, _3, l3, p4, m4), _MarkGUCPrefixReserved = Module._MarkGUCPrefixReserved = (e) => (_MarkGUCPrefixReserved = Module._MarkGUCPrefixReserved = wasmExports.MarkGUCPrefixReserved)(e), _sampler_random_init_state = Module._sampler_random_init_state = (e, t2) => (_sampler_random_init_state = Module._sampler_random_init_state = wasmExports.sampler_random_init_state)(e, t2), _pchomp = Module._pchomp = (e) => (_pchomp = Module._pchomp = wasmExports.pchomp)(e), _PinPortal = Module._PinPortal = (e) => (_PinPortal = Module._PinPortal = wasmExports.PinPortal)(e), _UnpinPortal = Module._UnpinPortal = (e) => (_UnpinPortal = Module._UnpinPortal = wasmExports.UnpinPortal)(e), _xmlBufferWriteCHAR = Module._xmlBufferWriteCHAR = (e, t2) => (_xmlBufferWriteCHAR = Module._xmlBufferWriteCHAR = wasmExports.xmlBufferWriteCHAR)(e, t2), _xmlBufferWriteChar = Module._xmlBufferWriteChar = (e, t2) => (_xmlBufferWriteChar = Module._xmlBufferWriteChar = wasmExports.xmlBufferWriteChar)(e, t2), _xmlReadMemory = Module._xmlReadMemory = (e, t2, r, a2, o4) => (_xmlReadMemory = Module._xmlReadMemory = wasmExports.xmlReadMemory)(e, t2, r, a2, o4), _xmlDocGetRootElement = Module._xmlDocGetRootElement = (e) => (_xmlDocGetRootElement = Module._xmlDocGetRootElement = wasmExports.xmlDocGetRootElement)(e), _xmlXPathIsNaN = Module._xmlXPathIsNaN = (e) => (_xmlXPathIsNaN = Module._xmlXPathIsNaN = wasmExports.xmlXPathIsNaN)(e), _xmlXPathCastToBoolean = Module._xmlXPathCastToBoolean = (e) => (_xmlXPathCastToBoolean = Module._xmlXPathCastToBoolean = wasmExports.xmlXPathCastToBoolean)(e), _xmlXPathCastToNumber = Module._xmlXPathCastToNumber = (e) => (_xmlXPathCastToNumber = Module._xmlXPathCastToNumber = wasmExports.xmlXPathCastToNumber)(e), ___dl_seterr = (e, t2) => (___dl_seterr = wasmExports.__dl_seterr)(e, t2), _getgid = Module._getgid = () => (_getgid = Module._getgid = wasmExports.getgid)(), _getuid = Module._getuid = () => (_getuid = Module._getuid = wasmExports.getuid)(), _gmtime = Module._gmtime = (e) => (_gmtime = Module._gmtime = wasmExports.gmtime)(e), _htonl = (e) => (_htonl = wasmExports.htonl)(e), _htons = (e) => (_htons = wasmExports.htons)(e), _ioctl = Module._ioctl = (e, t2, r) => (_ioctl = Module._ioctl = wasmExports.ioctl)(e, t2, r), _emscripten_builtin_memalign = (e, t2) => (_emscripten_builtin_memalign = wasmExports.emscripten_builtin_memalign)(e, t2), _ntohs = (e) => (_ntohs = wasmExports.ntohs)(e), _perror = Module._perror = (e) => (_perror = Module._perror = wasmExports.perror)(e), _qsort = Module._qsort = (e, t2, r, a2) => (_qsort = Module._qsort = wasmExports.qsort)(e, t2, r, a2), _srand = Module._srand = (e) => (_srand = Module._srand = wasmExports.srand)(e), _rand = Module._rand = () => (_rand = Module._rand = wasmExports.rand)(), __emscripten_timeout = (e, t2) => (__emscripten_timeout = wasmExports._emscripten_timeout)(e, t2), _strerror_r = Module._strerror_r = (e, t2, r) => (_strerror_r = Module._strerror_r = wasmExports.strerror_r)(e, t2, r), _strncat = Module._strncat = (e, t2, r) => (_strncat = Module._strncat = wasmExports.strncat)(e, t2, r), _setThrew = (e, t2) => (_setThrew = wasmExports.setThrew)(e, t2), __emscripten_tempret_set = (e) => (__emscripten_tempret_set = wasmExports._emscripten_tempret_set)(e), __emscripten_tempret_get = () => (__emscripten_tempret_get = wasmExports._emscripten_tempret_get)(), __emscripten_stack_restore = (e) => (__emscripten_stack_restore = wasmExports._emscripten_stack_restore)(e), __emscripten_stack_alloc = (e) => (__emscripten_stack_alloc = wasmExports._emscripten_stack_alloc)(e), _emscripten_stack_get_current = () => (_emscripten_stack_get_current = wasmExports.emscripten_stack_get_current)(), ___wasm_apply_data_relocs = () => (___wasm_apply_data_relocs = wasmExports.__wasm_apply_data_relocs)(), _stderr = Module._stderr = 2536848, _InterruptPending = Module._InterruptPending = 2677872, _MyLatch = Module._MyLatch = 2678060, _CritSectionCount = Module._CritSectionCount = 2677924, _MyProc = Module._MyProc = 2647676, _pg_global_prng_state = Module._pg_global_prng_state = 2624256, _error_context_stack = Module._error_context_stack = 2676168, _GUC_check_errdetail_string = Module._GUC_check_errdetail_string = 2681820, _IsUnderPostmaster = Module._IsUnderPostmaster = 2677953, _CurrentMemoryContext = Module._CurrentMemoryContext = 2683248, _stdout = Module._stdout = 2537152, _debug_query_string = Module._debug_query_string = 2538700, _MyProcPort = Module._MyProcPort = 2678048, ___THREW__ = Module.___THREW__ = 2698916, ___threwValue = Module.___threwValue = 2698920, _MyDatabaseId = Module._MyDatabaseId = 2677932, _TopMemoryContext = Module._TopMemoryContext = 2683252, _PG_exception_stack = Module._PG_exception_stack = 2676172, _MyProcPid = Module._MyProcPid = 2678024, _stdin = Module._stdin = 2537000, _ScanKeywords = Module._ScanKeywords = 2374040, _pg_number_of_ones = Module._pg_number_of_ones = 925120, _LocalBufferBlockPointers = Module._LocalBufferBlockPointers = 2644252, _BufferBlocks = Module._BufferBlocks = 2638988, _wal_level = Module._wal_level = 2387920, _SnapshotAnyData = Module._SnapshotAnyData = 2474096, _maintenance_work_mem = Module._maintenance_work_mem = 2421576, _ParallelWorkerNumber = Module._ParallelWorkerNumber = 2379480, _MainLWLockArray = Module._MainLWLockArray = 2645860, _CurrentResourceOwner = Module._CurrentResourceOwner = 2683296, _work_mem = Module._work_mem = 2421560, _NBuffers = Module._NBuffers = 2421584, _bsysscan = Module._bsysscan = 2625492, _CheckXidAlive = Module._CheckXidAlive = 2625488, _RecentXmin = Module._RecentXmin = 2474188, _XactIsoLevel = Module._XactIsoLevel = 2387784, _pgWalUsage = Module._pgWalUsage = 2628960, _pgBufferUsage = Module._pgBufferUsage = 2628832, _TTSOpsVirtual = Module._TTSOpsVirtual = 2391608, _TransamVariables = Module._TransamVariables = 2625480, _TopTransactionContext = Module._TopTransactionContext = 2683272, _RmgrTable = Module._RmgrTable = 2379504, _process_shared_preload_libraries_in_progress = Module._process_shared_preload_libraries_in_progress = 2681216, _wal_segment_size = Module._wal_segment_size = 2387940, _TopTransactionResourceOwner = Module._TopTransactionResourceOwner = 2683304, _arch_module_check_errdetail_string = Module._arch_module_check_errdetail_string = 2638372, _object_access_hook = Module._object_access_hook = 2627600, _InvalidObjectAddress = Module._InvalidObjectAddress = 1520620, _check_function_bodies = Module._check_function_bodies = 2421750, _post_parse_analyze_hook = Module._post_parse_analyze_hook = 2627640, _ScanKeywordTokens = Module._ScanKeywordTokens = 1551648, _SPI_processed = Module._SPI_processed = 2628984, _SPI_tuptable = Module._SPI_tuptable = 2628992, _TTSOpsMinimalTuple = Module._TTSOpsMinimalTuple = 2391712, _check_password_hook = Module._check_password_hook = 2627908, _ConfigReloadPending = Module._ConfigReloadPending = 2638360, _max_parallel_maintenance_workers = Module._max_parallel_maintenance_workers = 2421580, _DateStyle = Module._DateStyle = 2421548, _ExecutorStart_hook = Module._ExecutorStart_hook = 2628808, _ExecutorRun_hook = Module._ExecutorRun_hook = 2628812, _ExecutorFinish_hook = Module._ExecutorFinish_hook = 2628816, _ExecutorEnd_hook = Module._ExecutorEnd_hook = 2628820, _SPI_result = Module._SPI_result = 2628996, _ClientAuthentication_hook = Module._ClientAuthentication_hook = 2629168, _cpu_tuple_cost = Module._cpu_tuple_cost = 2392168, _cpu_operator_cost = Module._cpu_operator_cost = 2392184, _seq_page_cost = Module._seq_page_cost = 2392152, _planner_hook = Module._planner_hook = 2638056, _ShutdownRequestPending = Module._ShutdownRequestPending = 2638364, _MyStartTime = Module._MyStartTime = 2678032, _cluster_name = Module._cluster_name = 2421800, _application_name = Module._application_name = 2682044, _BufferDescriptors = Module._BufferDescriptors = 2638984, _shmem_startup_hook = Module._shmem_startup_hook = 2644932, _ProcessUtility_hook = Module._ProcessUtility_hook = 2647764, _IntervalStyle = Module._IntervalStyle = 2677956, _extra_float_digits = Module._extra_float_digits = 2411976, _pg_crc32_table = Module._pg_crc32_table = 2112288, _xmlFree = Module._xmlFree = 2523400, _shmem_request_hook = Module._shmem_request_hook = 2681220;
      function invoke_iii(e, t2, r) {
        var a2 = stackSave();
        try {
          return getWasmTableEntry(e)(t2, r);
        } catch (o4) {
          if (stackRestore(a2), o4 !== o4 + 0)
            throw o4;
          _setThrew(1, 0);
        }
      }
      function invoke_viiii(e, t2, r, a2, o4) {
        var s4 = stackSave();
        try {
          getWasmTableEntry(e)(t2, r, a2, o4);
        } catch (n3) {
          if (stackRestore(s4), n3 !== n3 + 0)
            throw n3;
          _setThrew(1, 0);
        }
      }
      function invoke_vi(e, t2) {
        var r = stackSave();
        try {
          getWasmTableEntry(e)(t2);
        } catch (a2) {
          if (stackRestore(r), a2 !== a2 + 0)
            throw a2;
          _setThrew(1, 0);
        }
      }
      function invoke_v(e) {
        var t2 = stackSave();
        try {
          getWasmTableEntry(e)();
        } catch (r) {
          if (stackRestore(t2), r !== r + 0)
            throw r;
          _setThrew(1, 0);
        }
      }
      function invoke_j(e) {
        var t2 = stackSave();
        try {
          return getWasmTableEntry(e)();
        } catch (r) {
          if (stackRestore(t2), r !== r + 0)
            throw r;
          return _setThrew(1, 0), 0n;
        }
      }
      function invoke_viiiiii(e, t2, r, a2, o4, s4, n3) {
        var _3 = stackSave();
        try {
          getWasmTableEntry(e)(t2, r, a2, o4, s4, n3);
        } catch (l3) {
          if (stackRestore(_3), l3 !== l3 + 0)
            throw l3;
          _setThrew(1, 0);
        }
      }
      function invoke_vii(e, t2, r) {
        var a2 = stackSave();
        try {
          getWasmTableEntry(e)(t2, r);
        } catch (o4) {
          if (stackRestore(a2), o4 !== o4 + 0)
            throw o4;
          _setThrew(1, 0);
        }
      }
      function invoke_iiiiii(e, t2, r, a2, o4, s4) {
        var n3 = stackSave();
        try {
          return getWasmTableEntry(e)(t2, r, a2, o4, s4);
        } catch (_3) {
          if (stackRestore(n3), _3 !== _3 + 0)
            throw _3;
          _setThrew(1, 0);
        }
      }
      function invoke_i(e) {
        var t2 = stackSave();
        try {
          return getWasmTableEntry(e)();
        } catch (r) {
          if (stackRestore(t2), r !== r + 0)
            throw r;
          _setThrew(1, 0);
        }
      }
      function invoke_ii(e, t2) {
        var r = stackSave();
        try {
          return getWasmTableEntry(e)(t2);
        } catch (a2) {
          if (stackRestore(r), a2 !== a2 + 0)
            throw a2;
          _setThrew(1, 0);
        }
      }
      function invoke_viii(e, t2, r, a2) {
        var o4 = stackSave();
        try {
          getWasmTableEntry(e)(t2, r, a2);
        } catch (s4) {
          if (stackRestore(o4), s4 !== s4 + 0)
            throw s4;
          _setThrew(1, 0);
        }
      }
      function invoke_vji(e, t2, r) {
        var a2 = stackSave();
        try {
          getWasmTableEntry(e)(t2, r);
        } catch (o4) {
          if (stackRestore(a2), o4 !== o4 + 0)
            throw o4;
          _setThrew(1, 0);
        }
      }
      function invoke_iiii(e, t2, r, a2) {
        var o4 = stackSave();
        try {
          return getWasmTableEntry(e)(t2, r, a2);
        } catch (s4) {
          if (stackRestore(o4), s4 !== s4 + 0)
            throw s4;
          _setThrew(1, 0);
        }
      }
      function invoke_iiiiiiii(e, t2, r, a2, o4, s4, n3, _3) {
        var l3 = stackSave();
        try {
          return getWasmTableEntry(e)(t2, r, a2, o4, s4, n3, _3);
        } catch (p4) {
          if (stackRestore(l3), p4 !== p4 + 0)
            throw p4;
          _setThrew(1, 0);
        }
      }
      function invoke_iiiii(e, t2, r, a2, o4) {
        var s4 = stackSave();
        try {
          return getWasmTableEntry(e)(t2, r, a2, o4);
        } catch (n3) {
          if (stackRestore(s4), n3 !== n3 + 0)
            throw n3;
          _setThrew(1, 0);
        }
      }
      function invoke_viiiiiiiii(e, t2, r, a2, o4, s4, n3, _3, l3, p4) {
        var m4 = stackSave();
        try {
          getWasmTableEntry(e)(t2, r, a2, o4, s4, n3, _3, l3, p4);
        } catch (d2) {
          if (stackRestore(m4), d2 !== d2 + 0)
            throw d2;
          _setThrew(1, 0);
        }
      }
      function invoke_viiiii(e, t2, r, a2, o4, s4) {
        var n3 = stackSave();
        try {
          getWasmTableEntry(e)(t2, r, a2, o4, s4);
        } catch (_3) {
          if (stackRestore(n3), _3 !== _3 + 0)
            throw _3;
          _setThrew(1, 0);
        }
      }
      function invoke_jii(e, t2, r) {
        var a2 = stackSave();
        try {
          return getWasmTableEntry(e)(t2, r);
        } catch (o4) {
          if (stackRestore(a2), o4 !== o4 + 0)
            throw o4;
          return _setThrew(1, 0), 0n;
        }
      }
      function invoke_ji(e, t2) {
        var r = stackSave();
        try {
          return getWasmTableEntry(e)(t2);
        } catch (a2) {
          if (stackRestore(r), a2 !== a2 + 0)
            throw a2;
          return _setThrew(1, 0), 0n;
        }
      }
      function invoke_jiiiiiiiii(e, t2, r, a2, o4, s4, n3, _3, l3, p4) {
        var m4 = stackSave();
        try {
          return getWasmTableEntry(e)(t2, r, a2, o4, s4, n3, _3, l3, p4);
        } catch (d2) {
          if (stackRestore(m4), d2 !== d2 + 0)
            throw d2;
          return _setThrew(1, 0), 0n;
        }
      }
      function invoke_jiiiiii(e, t2, r, a2, o4, s4, n3) {
        var _3 = stackSave();
        try {
          return getWasmTableEntry(e)(t2, r, a2, o4, s4, n3);
        } catch (l3) {
          if (stackRestore(_3), l3 !== l3 + 0)
            throw l3;
          return _setThrew(1, 0), 0n;
        }
      }
      function invoke_iiiiiiiiiiiiii(e, t2, r, a2, o4, s4, n3, _3, l3, p4, m4, d2, g5, u2) {
        var f3 = stackSave();
        try {
          return getWasmTableEntry(e)(t2, r, a2, o4, s4, n3, _3, l3, p4, m4, d2, g5, u2);
        } catch (c2) {
          if (stackRestore(f3), c2 !== c2 + 0)
            throw c2;
          _setThrew(1, 0);
        }
      }
      function invoke_iiiijii(e, t2, r, a2, o4, s4, n3) {
        var _3 = stackSave();
        try {
          return getWasmTableEntry(e)(t2, r, a2, o4, s4, n3);
        } catch (l3) {
          if (stackRestore(_3), l3 !== l3 + 0)
            throw l3;
          _setThrew(1, 0);
        }
      }
      function invoke_vijiji(e, t2, r, a2, o4, s4) {
        var n3 = stackSave();
        try {
          getWasmTableEntry(e)(t2, r, a2, o4, s4);
        } catch (_3) {
          if (stackRestore(n3), _3 !== _3 + 0)
            throw _3;
          _setThrew(1, 0);
        }
      }
      function invoke_viji(e, t2, r, a2) {
        var o4 = stackSave();
        try {
          getWasmTableEntry(e)(t2, r, a2);
        } catch (s4) {
          if (stackRestore(o4), s4 !== s4 + 0)
            throw s4;
          _setThrew(1, 0);
        }
      }
      function invoke_iiji(e, t2, r, a2) {
        var o4 = stackSave();
        try {
          return getWasmTableEntry(e)(t2, r, a2);
        } catch (s4) {
          if (stackRestore(o4), s4 !== s4 + 0)
            throw s4;
          _setThrew(1, 0);
        }
      }
      function invoke_iiiiiiiii(e, t2, r, a2, o4, s4, n3, _3, l3) {
        var p4 = stackSave();
        try {
          return getWasmTableEntry(e)(t2, r, a2, o4, s4, n3, _3, l3);
        } catch (m4) {
          if (stackRestore(p4), m4 !== m4 + 0)
            throw m4;
          _setThrew(1, 0);
        }
      }
      function invoke_iiiiiiiiiiiiiiiiii(e, t2, r, a2, o4, s4, n3, _3, l3, p4, m4, d2, g5, u2, f3, c2, w4, x6) {
        var S3 = stackSave();
        try {
          return getWasmTableEntry(e)(t2, r, a2, o4, s4, n3, _3, l3, p4, m4, d2, g5, u2, f3, c2, w4, x6);
        } catch (v3) {
          if (stackRestore(S3), v3 !== v3 + 0)
            throw v3;
          _setThrew(1, 0);
        }
      }
      function invoke_iiiij(e, t2, r, a2, o4) {
        var s4 = stackSave();
        try {
          return getWasmTableEntry(e)(t2, r, a2, o4);
        } catch (n3) {
          if (stackRestore(s4), n3 !== n3 + 0)
            throw n3;
          _setThrew(1, 0);
        }
      }
      function invoke_iiiiiii(e, t2, r, a2, o4, s4, n3) {
        var _3 = stackSave();
        try {
          return getWasmTableEntry(e)(t2, r, a2, o4, s4, n3);
        } catch (l3) {
          if (stackRestore(_3), l3 !== l3 + 0)
            throw l3;
          _setThrew(1, 0);
        }
      }
      function invoke_vj(e, t2) {
        var r = stackSave();
        try {
          getWasmTableEntry(e)(t2);
        } catch (a2) {
          if (stackRestore(r), a2 !== a2 + 0)
            throw a2;
          _setThrew(1, 0);
        }
      }
      function invoke_iiiiiiiiii(e, t2, r, a2, o4, s4, n3, _3, l3, p4) {
        var m4 = stackSave();
        try {
          return getWasmTableEntry(e)(t2, r, a2, o4, s4, n3, _3, l3, p4);
        } catch (d2) {
          if (stackRestore(m4), d2 !== d2 + 0)
            throw d2;
          _setThrew(1, 0);
        }
      }
      function invoke_viiji(e, t2, r, a2, o4) {
        var s4 = stackSave();
        try {
          getWasmTableEntry(e)(t2, r, a2, o4);
        } catch (n3) {
          if (stackRestore(s4), n3 !== n3 + 0)
            throw n3;
          _setThrew(1, 0);
        }
      }
      function invoke_viiiiiiii(e, t2, r, a2, o4, s4, n3, _3, l3) {
        var p4 = stackSave();
        try {
          getWasmTableEntry(e)(t2, r, a2, o4, s4, n3, _3, l3);
        } catch (m4) {
          if (stackRestore(p4), m4 !== m4 + 0)
            throw m4;
          _setThrew(1, 0);
        }
      }
      function invoke_vij(e, t2, r) {
        var a2 = stackSave();
        try {
          getWasmTableEntry(e)(t2, r);
        } catch (o4) {
          if (stackRestore(a2), o4 !== o4 + 0)
            throw o4;
          _setThrew(1, 0);
        }
      }
      function invoke_ij(e, t2) {
        var r = stackSave();
        try {
          return getWasmTableEntry(e)(t2);
        } catch (a2) {
          if (stackRestore(r), a2 !== a2 + 0)
            throw a2;
          _setThrew(1, 0);
        }
      }
      function invoke_viiiiiii(e, t2, r, a2, o4, s4, n3, _3) {
        var l3 = stackSave();
        try {
          getWasmTableEntry(e)(t2, r, a2, o4, s4, n3, _3);
        } catch (p4) {
          if (stackRestore(l3), p4 !== p4 + 0)
            throw p4;
          _setThrew(1, 0);
        }
      }
      function invoke_viiiji(e, t2, r, a2, o4, s4) {
        var n3 = stackSave();
        try {
          getWasmTableEntry(e)(t2, r, a2, o4, s4);
        } catch (_3) {
          if (stackRestore(n3), _3 !== _3 + 0)
            throw _3;
          _setThrew(1, 0);
        }
      }
      function invoke_iiij(e, t2, r, a2) {
        var o4 = stackSave();
        try {
          return getWasmTableEntry(e)(t2, r, a2);
        } catch (s4) {
          if (stackRestore(o4), s4 !== s4 + 0)
            throw s4;
          _setThrew(1, 0);
        }
      }
      function invoke_vid(e, t2, r) {
        var a2 = stackSave();
        try {
          getWasmTableEntry(e)(t2, r);
        } catch (o4) {
          if (stackRestore(a2), o4 !== o4 + 0)
            throw o4;
          _setThrew(1, 0);
        }
      }
      function invoke_ijiiiiii(e, t2, r, a2, o4, s4, n3, _3) {
        var l3 = stackSave();
        try {
          return getWasmTableEntry(e)(t2, r, a2, o4, s4, n3, _3);
        } catch (p4) {
          if (stackRestore(l3), p4 !== p4 + 0)
            throw p4;
          _setThrew(1, 0);
        }
      }
      function invoke_viijii(e, t2, r, a2, o4, s4) {
        var n3 = stackSave();
        try {
          getWasmTableEntry(e)(t2, r, a2, o4, s4);
        } catch (_3) {
          if (stackRestore(n3), _3 !== _3 + 0)
            throw _3;
          _setThrew(1, 0);
        }
      }
      function invoke_iiiiiji(e, t2, r, a2, o4, s4, n3) {
        var _3 = stackSave();
        try {
          return getWasmTableEntry(e)(t2, r, a2, o4, s4, n3);
        } catch (l3) {
          if (stackRestore(_3), l3 !== l3 + 0)
            throw l3;
          _setThrew(1, 0);
        }
      }
      function invoke_viijiiii(e, t2, r, a2, o4, s4, n3, _3) {
        var l3 = stackSave();
        try {
          getWasmTableEntry(e)(t2, r, a2, o4, s4, n3, _3);
        } catch (p4) {
          if (stackRestore(l3), p4 !== p4 + 0)
            throw p4;
          _setThrew(1, 0);
        }
      }
      function invoke_viij(e, t2, r, a2) {
        var o4 = stackSave();
        try {
          getWasmTableEntry(e)(t2, r, a2);
        } catch (s4) {
          if (stackRestore(o4), s4 !== s4 + 0)
            throw s4;
          _setThrew(1, 0);
        }
      }
      function invoke_jiiii(e, t2, r, a2, o4) {
        var s4 = stackSave();
        try {
          return getWasmTableEntry(e)(t2, r, a2, o4);
        } catch (n3) {
          if (stackRestore(s4), n3 !== n3 + 0)
            throw n3;
          return _setThrew(1, 0), 0n;
        }
      }
      function invoke_viiiiiiiiiiii(e, t2, r, a2, o4, s4, n3, _3, l3, p4, m4, d2, g5) {
        var u2 = stackSave();
        try {
          getWasmTableEntry(e)(t2, r, a2, o4, s4, n3, _3, l3, p4, m4, d2, g5);
        } catch (f3) {
          if (stackRestore(u2), f3 !== f3 + 0)
            throw f3;
          _setThrew(1, 0);
        }
      }
      function invoke_di(e, t2) {
        var r = stackSave();
        try {
          return getWasmTableEntry(e)(t2);
        } catch (a2) {
          if (stackRestore(r), a2 !== a2 + 0)
            throw a2;
          _setThrew(1, 0);
        }
      }
      function invoke_id(e, t2) {
        var r = stackSave();
        try {
          return getWasmTableEntry(e)(t2);
        } catch (a2) {
          if (stackRestore(r), a2 !== a2 + 0)
            throw a2;
          _setThrew(1, 0);
        }
      }
      function invoke_ijiiiii(e, t2, r, a2, o4, s4, n3) {
        var _3 = stackSave();
        try {
          return getWasmTableEntry(e)(t2, r, a2, o4, s4, n3);
        } catch (l3) {
          if (stackRestore(_3), l3 !== l3 + 0)
            throw l3;
          _setThrew(1, 0);
        }
      }
      function invoke_iiiiiiiiiii(e, t2, r, a2, o4, s4, n3, _3, l3, p4, m4) {
        var d2 = stackSave();
        try {
          return getWasmTableEntry(e)(t2, r, a2, o4, s4, n3, _3, l3, p4, m4);
        } catch (g5) {
          if (stackRestore(d2), g5 !== g5 + 0)
            throw g5;
          _setThrew(1, 0);
        }
      }
      Module.addRunDependency = addRunDependency, Module.removeRunDependency = removeRunDependency, Module.wasmTable = wasmTable, Module.addFunction = addFunction, Module.removeFunction = removeFunction, Module.setValue = setValue, Module.getValue = getValue, Module.UTF8ToString = UTF8ToString, Module.stringToNewUTF8 = stringToNewUTF8, Module.stringToUTF8OnStack = stringToUTF8OnStack, Module.FS_createPreloadedFile = FS_createPreloadedFile, Module.FS_unlink = FS_unlink, Module.FS_createPath = FS_createPath, Module.FS_createDevice = FS_createDevice, Module.FS = FS, Module.FS_createDataFile = FS_createDataFile, Module.FS_createLazyFile = FS_createLazyFile, Module.MEMFS = MEMFS, Module.IDBFS = IDBFS;
      var calledRun;
      dependenciesFulfilled = function e() {
        calledRun || run(), calledRun || (dependenciesFulfilled = e);
      };
      function callMain(e = []) {
        var t2 = resolveGlobalSymbol("main").sym;
        if (t2) {
          e.unshift(thisProgram);
          var r = e.length, a2 = stackAlloc((r + 1) * 4), o4 = a2;
          e.forEach((n3) => {
            HEAPU32[o4 >> 2] = stringToUTF8OnStack(n3), o4 += 4;
          }), HEAPU32[o4 >> 2] = 0;
          try {
            var s4 = t2(r, a2);
            return exitJS(s4, true), s4;
          } catch (n3) {
            return handleException(n3);
          }
        }
      }
      function run(e = arguments_) {
        if (runDependencies > 0 || (preRun(), runDependencies > 0))
          return;
        function t2() {
          calledRun || (calledRun = true, Module.calledRun = true, !ABORT && (initRuntime(), preMain(), readyPromiseResolve(Module), Module.onRuntimeInitialized?.(), shouldRunNow && callMain(e), postRun()));
        }
        Module.setStatus ? (Module.setStatus("Running..."), setTimeout(() => {
          setTimeout(() => Module.setStatus(""), 1), t2();
        }, 1)) : t2();
      }
      if (Module.preInit)
        for (typeof Module.preInit == "function" && (Module.preInit = [Module.preInit]);Module.preInit.length > 0; )
          Module.preInit.pop()();
      var shouldRunNow = true;
      return Module.noInitialRun && (shouldRunNow = false), run(), moduleRtn = readyPromise, moduleRtn;
    };
  })();
  He2 = pt2;
  je2 = He2;
  L5 = class L6 extends k2 {
    constructor(r = {}, a2 = {}) {
      super();
      R(this, C4);
      R(this, ne2, false);
      R(this, te2, false);
      R(this, re2, false);
      R(this, ie, false);
      R(this, _e2, false);
      R(this, xe2, new Y2);
      R(this, we2, new Y2);
      R(this, Se2, new Y2);
      R(this, ye2, new Y2);
      R(this, le2, false);
      this.debug = 0;
      R(this, pe2);
      R(this, he2, []);
      R(this, de2, new ye);
      R(this, ae);
      R(this, $3);
      R(this, I2, new Map);
      R(this, oe, new Set);
      R(this, me2, -1);
      R(this, B, []);
      R(this, Q2, false);
      R(this, K2);
      R(this, ue2, -1);
      R(this, se2, []);
      R(this, J2, 0);
      R(this, O4, null);
      R(this, Z2, true);
      R(this, q2, new Uint8Array(0));
      R(this, G3, 0);
      typeof r == "string" ? a2 = { dataDir: r, ...a2 } : a2 = r, this.dataDir = a2.dataDir, a2.parsers !== undefined && (this.parsers = { ...this.parsers, ...a2.parsers }), a2.serializers !== undefined && (this.serializers = { ...this.serializers, ...a2.serializers }), a2?.debug !== undefined && (this.debug = a2.debug), a2?.relaxedDurability !== undefined && x(this, _e2, a2.relaxedDurability), x(this, pe2, a2.extensions ?? {}), this.waitReady = T(this, C4, Ve2).call(this, a2 ?? {});
    }
    static async create(r, a2) {
      let o4 = typeof r == "string" ? { dataDir: r, ...a2 ?? {} } : r ?? {}, s4 = new L6(o4);
      return await s4.waitReady, s4;
    }
    get Module() {
      return this.mod;
    }
    get ready() {
      return h(this, ne2) && !h(this, te2) && !h(this, re2);
    }
    get closed() {
      return h(this, re2);
    }
    async close() {
      await this._checkReady(), x(this, te2, true);
      for (let r of h(this, he2))
        await r();
      try {
        await this.execProtocol(k.end()), this.mod._pgl_shutdown(), this.mod.removeFunction(h(this, ue2)), this.mod.removeFunction(h(this, me2));
      } catch (r) {
        let a2 = r;
        if (!(a2.name === "ExitStatus" && a2.status === 0))
          throw r;
      }
      await this.fs.closeFs(), x(this, re2, true), x(this, te2, false);
    }
    async[Symbol.asyncDispose]() {
      await this.close();
    }
    async _handleBlob(r) {
      x(this, ae, r ? await r.arrayBuffer() : undefined);
    }
    async _cleanupBlob() {
      x(this, ae, undefined);
    }
    async _getWrittenBlob() {
      if (!h(this, $3))
        return;
      let r = new Blob(h(this, $3));
      return x(this, $3, undefined), r;
    }
    async _checkReady() {
      if (h(this, te2))
        throw new Error("PGlite is closing");
      if (h(this, re2))
        throw new Error("PGlite is closed");
      h(this, ne2) || await this.waitReady;
    }
    execProtocolRawSync(r) {
      let a2 = this.mod;
      return x(this, J2, 0), x(this, G3, 0), x(this, se2, r), h(this, Z2) && h(this, q2).length !== L6.DEFAULT_RECV_BUF_SIZE && x(this, q2, new Uint8Array(L6.DEFAULT_RECV_BUF_SIZE)), a2._interactive_one(r.length, r[0]), x(this, se2, []), h(this, Z2) && h(this, G3) ? h(this, q2).subarray(0, h(this, G3)) : new Uint8Array(0);
    }
    async execProtocolRaw(r, { syncToFs: a2 = true } = {}) {
      let o4 = this.execProtocolRawSync(r);
      return a2 && await this.syncToFs(), o4;
    }
    async execProtocol(r, { syncToFs: a2 = true, throwOnError: o4 = true, onNotice: s4 } = {}) {
      x(this, Q2, o4), x(this, K2, s4), x(this, B, []), x(this, O4, null);
      let n3 = await this.execProtocolRaw(r, { syncToFs: a2 }), _3 = h(this, O4);
      x(this, Q2, false), x(this, K2, undefined), x(this, O4, null);
      let l3 = { messages: h(this, B), data: n3 };
      if (x(this, B, []), o4 && _3)
        throw x(this, de2, new ye), _3;
      return l3;
    }
    async execProtocolStream(r, { syncToFs: a2, throwOnError: o4 = true, onNotice: s4 } = {}) {
      x(this, Q2, o4), x(this, K2, s4), x(this, B, []), x(this, O4, null), x(this, Z2, false), await this.execProtocolRaw(r, { syncToFs: a2 }), x(this, Z2, true);
      let n3 = h(this, O4);
      x(this, Q2, false), x(this, K2, undefined), x(this, O4, null);
      let _3 = h(this, B);
      if (x(this, B, []), o4 && n3)
        throw x(this, de2, new ye), n3;
      return _3;
    }
    isInTransaction() {
      return h(this, ie);
    }
    async syncToFs() {
      if (h(this, le2))
        return;
      x(this, le2, true);
      let r = async () => {
        await h(this, ye2).runExclusive(async () => {
          x(this, le2, false), await this.fs.syncToFs(h(this, _e2));
        });
      };
      h(this, _e2) ? r() : await r();
    }
    async listen(r, a2, o4) {
      return this._runExclusiveListen(() => T(this, C4, Ke2).call(this, r, a2, o4));
    }
    async unlisten(r, a2, o4) {
      return this._runExclusiveListen(() => T(this, C4, Ye2).call(this, r, a2, o4));
    }
    onNotification(r) {
      return h(this, oe).add(r), () => {
        h(this, oe).delete(r);
      };
    }
    offNotification(r) {
      h(this, oe).delete(r);
    }
    async dumpDataDir(r) {
      await this._checkReady();
      let a2 = this.dataDir?.split("/").pop() ?? "pgdata";
      return this.fs.dumpTar(a2, r);
    }
    _runExclusiveQuery(r) {
      return h(this, xe2).runExclusive(r);
    }
    _runExclusiveTransaction(r) {
      return h(this, we2).runExclusive(r);
    }
    async clone() {
      let r = await this.dumpDataDir("none");
      return L6.create({ loadDataDir: r, extensions: h(this, pe2) });
    }
    _runExclusiveListen(r) {
      return h(this, Se2).runExclusive(r);
    }
  };
  ne2 = new WeakMap, te2 = new WeakMap, re2 = new WeakMap, ie = new WeakMap, _e2 = new WeakMap, xe2 = new WeakMap, we2 = new WeakMap, Se2 = new WeakMap, ye2 = new WeakMap, le2 = new WeakMap, pe2 = new WeakMap, he2 = new WeakMap, de2 = new WeakMap, ae = new WeakMap, $3 = new WeakMap, I2 = new WeakMap, oe = new WeakMap, me2 = new WeakMap, B = new WeakMap, Q2 = new WeakMap, K2 = new WeakMap, ue2 = new WeakMap, se2 = new WeakMap, J2 = new WeakMap, O4 = new WeakMap, Z2 = new WeakMap, q2 = new WeakMap, G3 = new WeakMap, C4 = new WeakSet, Ve2 = async function(r) {
    if (r.fs)
      this.fs = r.fs;
    else {
      let { dataDir: d2, fsType: g5 } = Ge2(r.dataDir);
      this.fs = await Ue2(d2, g5);
    }
    let a2 = {}, o4 = [], s4 = [`PGDATA=${C2}`, `PREFIX=${Vr}`, `PGUSER=${r.username ?? "postgres"}`, `PGDATABASE=${r.database ?? "template1"}`, "MODE=REACT", "REPL=N", ...this.debug ? ["-d", this.debug.toString()] : []];
    r.wasmModule || Rr();
    let n3 = r.fsBundle ? r.fsBundle.arrayBuffer() : Er(), _3;
    n3.then((d2) => {
      _3 = d2;
    });
    let l3 = { WASM_PREFIX: Vr, arguments: s4, INITIAL_MEMORY: r.initialMemory, noExitRuntime: true, ...this.debug > 0 ? { print: console.info, printErr: console.error } : { print: () => {}, printErr: () => {} }, instantiateWasm: (d2, g5) => (Tr(d2, r.wasmModule).then(({ instance: u2, module: f3 }) => {
      g5(u2, f3);
    }), {}), getPreloadedPackage: (d2, g5) => {
      if (d2 === "pglite.data") {
        if (_3.byteLength !== g5)
          throw new Error(`Invalid FS bundle size: ${_3.byteLength} !== ${g5}`);
        return _3;
      }
      throw new Error(`Unknown package: ${d2}`);
    }, preRun: [(d2) => {
      let g5 = d2.FS.makedev(64, 0), u2 = { open: (f3) => {}, close: (f3) => {}, read: (f3, c2, w4, x6, S3) => {
        let v3 = h(this, ae);
        if (!v3)
          throw new Error("No /dev/blob File or Blob provided to read from");
        let b3 = new Uint8Array(v3);
        if (S3 >= b3.length)
          return 0;
        let M2 = Math.min(b3.length - S3, x6);
        for (let y4 = 0;y4 < M2; y4++)
          c2[w4 + y4] = b3[S3 + y4];
        return M2;
      }, write: (f3, c2, w4, x6, S3) => (h(this, $3) ?? x(this, $3, []), h(this, $3).push(c2.slice(w4, w4 + x6)), x6), llseek: (f3, c2, w4) => {
        let x6 = h(this, ae);
        if (!x6)
          throw new Error("No /dev/blob File or Blob provided to llseek");
        let S3 = c2;
        if (w4 === 1 ? S3 += f3.position : w4 === 2 && (S3 = new Uint8Array(x6).length), S3 < 0)
          throw new d2.FS.ErrnoError(28);
        return S3;
      } };
      d2.FS.registerDevice(g5, u2), d2.FS.mkdev("/dev/blob", g5);
    }] }, { emscriptenOpts: p4 } = await this.fs.init(this, l3);
    l3 = p4;
    for (let [d2, g5] of Object.entries(h(this, pe2)))
      if (g5 instanceof URL)
        a2[d2] = ke2(g5);
      else {
        let u2 = await g5.setup(this, l3);
        if (u2.emscriptenOpts && (l3 = u2.emscriptenOpts), u2.namespaceObj) {
          let f3 = this;
          f3[d2] = u2.namespaceObj;
        }
        u2.bundlePath && (a2[d2] = ke2(u2.bundlePath)), u2.init && o4.push(u2.init), u2.close && h(this, he2).push(u2.close);
      }
    if (l3.pg_extensions = a2, await n3, this.mod = await je2(l3), x(this, me2, this.mod.addFunction((d2, g5) => {
      let u2;
      try {
        u2 = this.mod.HEAPU8.subarray(d2, d2 + g5);
      } catch (f3) {
        throw console.error("error", f3), f3;
      }
      if (h(this, de2).parse(u2, (f3) => {
        T(this, C4, Xe2).call(this, f3);
      }), h(this, Z2)) {
        let f3 = u2.slice(), c2 = h(this, G3) + f3.length;
        if (c2 > h(this, q2).length) {
          let w4 = h(this, q2).length + (h(this, q2).length >> 1) + c2;
          c2 > L5.MAX_BUFFER_SIZE && (c2 = L5.MAX_BUFFER_SIZE);
          let x6 = new Uint8Array(w4);
          x6.set(h(this, q2).subarray(0, h(this, G3))), x(this, q2, x6);
        }
        return h(this, q2).set(f3, h(this, G3)), x(this, G3, h(this, G3) + f3.length), h(this, q2).length;
      }
      return g5;
    }, "iii")), x(this, ue2, this.mod.addFunction((d2, g5) => {
      let u2 = h(this, se2).length - h(this, J2);
      u2 > g5 && (u2 = g5);
      try {
        this.mod.HEAP8.set(h(this, se2).subarray(h(this, J2), h(this, J2) + u2), d2), x(this, J2, h(this, J2) + u2);
      } catch (f3) {
        console.log(f3);
      }
      return u2;
    }, "iii")), this.mod._set_read_write_cbs(h(this, ue2), h(this, me2)), await this.fs.initialSyncFs(), r.loadDataDir) {
      if (this.mod.FS.analyzePath(C2 + "/PG_VERSION").exists)
        throw new Error("Database already exists, cannot load from tarball");
      T(this, C4, fe2).call(this, "pglite: loading data from tarball"), await ce2(this.mod.FS, r.loadDataDir, C2);
    }
    this.mod.FS.analyzePath(C2 + "/PG_VERSION").exists ? T(this, C4, fe2).call(this, "pglite: found DB, resuming") : T(this, C4, fe2).call(this, "pglite: no db"), await Be2(this.mod, (...d2) => T(this, C4, fe2).call(this, ...d2));
    let m4 = this.mod._pgl_initdb();
    if (!m4)
      throw new Error("INITDB failed to return value");
    if (m4 & 1)
      throw new Error("INITDB: failed to execute");
    if (m4 & 2) {
      let d2 = r.username ?? "postgres", g5 = r.database ?? "template1";
      if (m4 & 4) {
        if (!(m4 & 12))
          throw new Error(`INITDB: Invalid db ${g5}/user ${d2} combination`);
      } else if (g5 !== "template1" && d2 !== "postgres")
        throw new Error(`INITDB: created a new datadir ${C2}, but an alternative db ${g5}/user ${d2} was requested`);
    }
    this.mod._pgl_backend(), await this.syncToFs(), x(this, ne2, true), await this.exec("SET search_path TO public;"), await this._initArrayTypes();
    for (let d2 of o4)
      await d2();
  }, Xe2 = function(r) {
    if (!h(this, O4)) {
      if (r instanceof C)
        h(this, Q2) && x(this, O4, r);
      else if (r instanceof te)
        this.debug > 0 && console.warn(r), h(this, K2) && h(this, K2).call(this, r);
      else if (r instanceof Z)
        switch (r.text) {
          case "BEGIN":
            x(this, ie, true);
            break;
          case "COMMIT":
          case "ROLLBACK":
            x(this, ie, false);
            break;
        }
      else if (r instanceof J) {
        let a2 = h(this, I2).get(r.channel);
        a2 && a2.forEach((o4) => {
          queueMicrotask(() => o4(r.payload));
        }), h(this, oe).forEach((o4) => {
          queueMicrotask(() => o4(r.channel, r.payload));
        });
      }
      h(this, B).push(r);
    }
  }, fe2 = function(...r) {
    this.debug > 0 && console.log(...r);
  }, Ke2 = async function(r, a2, o4) {
    let s4 = Nr(r), n3 = o4 ?? this;
    h(this, I2).has(s4) || h(this, I2).set(s4, new Set), h(this, I2).get(s4).add(a2);
    try {
      await n3.exec(`LISTEN ${r}`);
    } catch (_3) {
      throw h(this, I2).get(s4).delete(a2), h(this, I2).get(s4)?.size === 0 && h(this, I2).delete(s4), _3;
    }
    return async (_3) => {
      await this.unlisten(s4, a2, _3);
    };
  }, Ye2 = async function(r, a2, o4) {
    let s4 = Nr(r), n3 = o4 ?? this, _3 = async () => {
      await n3.exec(`UNLISTEN ${r}`), h(this, I2).get(s4)?.size === 0 && h(this, I2).delete(s4);
    };
    a2 ? (h(this, I2).get(s4)?.delete(a2), h(this, I2).get(s4)?.size === 0 && await _3()) : await _3();
  }, L5.DEFAULT_RECV_BUF_SIZE = 1048576, L5.MAX_BUFFER_SIZE = Math.pow(2, 30);
  We2 = L5;
  u();
});

// src/orchestrator/db/live-query.ts
class QueryHelpers {
  pg;
  constructor(pg) {
    this.pg = pg;
  }
  async query(sql, params) {
    const result = await this.pg.query(sql, params);
    return result.rows;
  }
  async queryOne(sql, params) {
    const rows = await this.query(sql, params);
    return rows[0] ?? null;
  }
  async queryValue(sql, params) {
    const row = await this.queryOne(sql, params);
    return row?.value ?? null;
  }
  async execute(sql, params) {
    const result = await this.pg.query(sql, params);
    return result.affectedRows ?? 0;
  }
}

// src/orchestrator/db/state.ts
class StateManager {
  pg;
  queries;
  currentExecutionId = null;
  constructor(pg) {
    this.pg = pg;
    this.queries = new QueryHelpers(pg);
  }
  setExecutionContext(executionId) {
    this.currentExecutionId = executionId;
  }
  async get(key) {
    const result = await this.queries.queryOne(`SELECT key, value, updated_at FROM state WHERE key = $1`, [key]);
    if (!result)
      return null;
    return result.value;
  }
  async getAll() {
    const rows = await this.queries.query(`SELECT key, value FROM state`);
    const state = {};
    for (const row of rows) {
      state[row.key] = row.value;
    }
    return state;
  }
  async set(key, value, trigger, triggerAgentId) {
    const oldValue = await this.get(key);
    await this.pg.query(`INSERT INTO state (key, value, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE
       SET value = $2, updated_at = NOW()`, [key, JSON.stringify(value)]);
    await this.logTransition(key, oldValue, value, trigger, triggerAgentId);
  }
  async setMany(updates, trigger, triggerAgentId) {
    await this.pg.query("BEGIN");
    try {
      for (const [key, value] of Object.entries(updates)) {
        await this.set(key, value, trigger, triggerAgentId);
      }
      await this.pg.query("COMMIT");
    } catch (error2) {
      await this.pg.query("ROLLBACK");
      throw error2;
    }
  }
  async delete(key, trigger) {
    const oldValue = await this.get(key);
    await this.pg.query(`DELETE FROM state WHERE key = $1`, [key]);
    await this.logTransition(key, oldValue, null, trigger);
  }
  async reset() {
    await this.pg.query("DELETE FROM state");
    await this.pg.query(`
      INSERT INTO state (key, value) VALUES
        ('phase', '"initial"'),
        ('iteration', '0'),
        ('data', 'null')
    `);
  }
  async getHistory(key, limit = 100) {
    return this.queries.query(`SELECT *
       FROM transitions
       WHERE key = $1
       ORDER BY created_at DESC
       LIMIT $2`, [key, limit]);
  }
  async getRecentTransitions(limit = 100) {
    return this.queries.query(`SELECT *
       FROM transitions
       WHERE execution_id = $1 OR execution_id IS NULL
       ORDER BY created_at DESC
       LIMIT $2`, [this.currentExecutionId, limit]);
  }
  async logTransition(key, oldValue, newValue, trigger, triggerAgentId) {
    await this.pg.query(`INSERT INTO transitions (
        execution_id,
        key,
        old_value,
        new_value,
        trigger,
        trigger_agent_id,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW())`, [
      this.currentExecutionId,
      key,
      oldValue ? JSON.stringify(oldValue) : null,
      newValue ? JSON.stringify(newValue) : null,
      trigger,
      triggerAgentId
    ]);
  }
  async replayTo(transitionId) {
    const transitions = await this.queries.query(`SELECT *
       FROM transitions
       WHERE created_at <= (SELECT created_at FROM transitions WHERE id = $1)
       ORDER BY created_at`, [transitionId]);
    await this.pg.query("DELETE FROM state");
    for (const t2 of transitions) {
      const value = typeof t2.new_value === "string" ? JSON.parse(t2.new_value) : t2.new_value;
      await this.pg.query(`INSERT INTO state (key, value)
         VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE
         SET value = $2`, [t2.key, JSON.stringify(value)]);
    }
  }
  async snapshot() {
    return this.getAll();
  }
  async restore(snapshot, trigger) {
    await this.pg.query("BEGIN");
    try {
      await this.reset();
      for (const [key, value] of Object.entries(snapshot)) {
        await this.set(key, value, trigger || "restore");
      }
      await this.pg.query("COMMIT");
    } catch (error2) {
      await this.pg.query("ROLLBACK");
      throw error2;
    }
  }
}
var init_state = () => {};

// src/orchestrator/db/memories.ts
class MemoryManager {
  pg;
  queries;
  currentExecutionId = null;
  constructor(pg) {
    this.pg = pg;
    this.queries = new QueryHelpers(pg);
  }
  setExecutionContext(executionId) {
    this.currentExecutionId = executionId;
  }
  async add(input) {
    const result = await this.pg.query(`INSERT INTO memories (
        category,
        scope,
        key,
        content,
        confidence,
        source,
        source_execution_id,
        created_at,
        updated_at,
        accessed_at,
        expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW(), NOW(), $8)
      ON CONFLICT (category, scope, key) DO UPDATE
      SET
        content = $4,
        confidence = $5,
        source = $6,
        updated_at = NOW()
      RETURNING id`, [
      input.category,
      input.scope || "global",
      input.key,
      input.content,
      input.confidence ?? 1,
      input.source,
      this.currentExecutionId,
      input.expires_at
    ]);
    return result.rows[0]?.id ?? "";
  }
  async get(category, key, scope = "global") {
    const memory = await this.queries.queryOne(`SELECT * FROM memories
       WHERE category = $1 AND key = $2 AND scope = $3`, [category, key, scope]);
    if (memory) {
      await this.pg.query(`UPDATE memories SET accessed_at = NOW() WHERE id = $1`, [memory.id]);
    }
    return memory;
  }
  async list(category, scope, limit = 100) {
    let sql = "SELECT * FROM memories WHERE 1=1";
    const params = [];
    if (category) {
      params.push(category);
      sql += ` AND category = $${params.length}`;
    }
    if (scope) {
      params.push(scope);
      sql += ` AND scope = $${params.length}`;
    }
    sql += " AND (expires_at IS NULL OR expires_at > NOW())";
    sql += ` ORDER BY accessed_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);
    return this.queries.query(sql, params);
  }
  async search(query, category, limit = 10) {
    let sql = `
      SELECT *,
        ts_rank(to_tsvector('english', content), plainto_tsquery('english', $1)) as rank
      FROM memories
      WHERE to_tsvector('english', content) @@ plainto_tsquery('english', $1)
    `;
    const params = [query];
    if (category) {
      params.push(category);
      sql += ` AND category = $${params.length}`;
    }
    sql += " AND (expires_at IS NULL OR expires_at > NOW())";
    sql += ` ORDER BY rank DESC LIMIT $${params.length + 1}`;
    params.push(limit);
    return this.queries.query(sql, params);
  }
  async update(id, updates) {
    const sets = ["updated_at = NOW()"];
    const params = [];
    if (updates.content !== undefined) {
      params.push(updates.content);
      sets.push(`content = $${params.length}`);
    }
    if (updates.confidence !== undefined) {
      params.push(updates.confidence);
      sets.push(`confidence = $${params.length}`);
    }
    if (updates.expires_at !== undefined) {
      params.push(updates.expires_at);
      sets.push(`expires_at = $${params.length}`);
    }
    params.push(id);
    await this.pg.query(`UPDATE memories SET ${sets.join(", ")} WHERE id = $${params.length}`, params);
  }
  async delete(id) {
    await this.pg.query("DELETE FROM memories WHERE id = $1", [id]);
  }
  async deleteByKey(category, key, scope = "global") {
    await this.pg.query("DELETE FROM memories WHERE category = $1 AND key = $2 AND scope = $3", [category, key, scope]);
  }
  async cleanupExpired() {
    const result = await this.pg.query("DELETE FROM memories WHERE expires_at IS NOT NULL AND expires_at < NOW()");
    return result.affectedRows ?? 0;
  }
  async getStats() {
    const [totalResult, categoryResult, scopeResult] = await Promise.all([
      this.queries.queryValue("SELECT COUNT(*) as value FROM memories"),
      this.queries.query("SELECT category, COUNT(*) as count FROM memories GROUP BY category"),
      this.queries.query("SELECT scope, COUNT(*) as count FROM memories GROUP BY scope")
    ]);
    return {
      total: totalResult ?? 0,
      byCategory: Object.fromEntries(categoryResult.map((r) => [r.category, r.count])),
      byScope: Object.fromEntries(scopeResult.map((r) => [r.scope, r.count]))
    };
  }
  async addFact(key, content, source) {
    return this.add({
      category: "fact",
      key,
      content,
      source
    });
  }
  async addLearning(key, content, source) {
    return this.add({
      category: "learning",
      key,
      content,
      source
    });
  }
  async addPreference(key, content, scope = "project") {
    return this.add({
      category: "preference",
      key,
      content,
      scope
    });
  }
}
var init_memories = () => {};

// src/orchestrator/db/execution.ts
import * as fs6 from "fs/promises";
import { exec as execCallback } from "child_process";
import { promisify } from "util";

class ExecutionManager {
  pg;
  queries;
  currentExecutionId = null;
  currentPhaseId = null;
  currentAgentId = null;
  currentStepId = null;
  constructor(pg) {
    this.pg = pg;
    this.queries = new QueryHelpers(pg);
  }
  async startExecution(name2, filePath, config = {}) {
    const result = await this.pg.query(`INSERT INTO executions (
        name,
        file_path,
        status,
        config,
        started_at,
        created_at
      ) VALUES ($1, $2, 'running', $3, NOW(), NOW())
      RETURNING id`, [name2, filePath, JSON.stringify(config)]);
    this.currentExecutionId = result.rows[0]?.id ?? "";
    return this.currentExecutionId;
  }
  async completeExecution(id, result) {
    await this.pg.query(`UPDATE executions
       SET status = 'completed',
           result = $2,
           completed_at = NOW()
       WHERE id = $1`, [id, result ? JSON.stringify(result) : null]);
  }
  async failExecution(id, error2) {
    await this.pg.query(`UPDATE executions
       SET status = 'failed',
           error = $2,
           completed_at = NOW()
       WHERE id = $1`, [id, error2]);
  }
  async cancelExecution(id) {
    await this.pg.query(`UPDATE executions
       SET status = 'cancelled',
           completed_at = NOW()
       WHERE id = $1`, [id]);
  }
  async getCurrentExecution() {
    if (!this.currentExecutionId)
      return null;
    return this.getExecution(this.currentExecutionId);
  }
  async getExecution(id) {
    return this.queries.queryOne("SELECT * FROM executions WHERE id = $1", [id]);
  }
  async listExecutions(limit = 100) {
    return this.queries.query("SELECT * FROM executions ORDER BY created_at DESC LIMIT $1", [limit]);
  }
  async findIncompleteExecution() {
    return this.queries.queryOne(`SELECT * FROM executions
       WHERE status = 'running'
       AND completed_at IS NULL
       ORDER BY created_at DESC
       LIMIT 1`);
  }
  async updateExecutionMetrics(id, updates) {
    const sets = [];
    const params = [];
    if (updates.total_iterations !== undefined) {
      params.push(updates.total_iterations);
      sets.push(`total_iterations = $${params.length}`);
    }
    if (updates.total_agents !== undefined) {
      params.push(updates.total_agents);
      sets.push(`total_agents = $${params.length}`);
    }
    if (updates.total_tool_calls !== undefined) {
      params.push(updates.total_tool_calls);
      sets.push(`total_tool_calls = $${params.length}`);
    }
    if (updates.total_tokens_used !== undefined) {
      params.push(updates.total_tokens_used);
      sets.push(`total_tokens_used = $${params.length}`);
    }
    if (sets.length === 0)
      return;
    params.push(id);
    await this.pg.query(`UPDATE executions SET ${sets.join(", ")} WHERE id = $${params.length}`, params);
  }
  async startPhase(name2, iteration = 0) {
    if (!this.currentExecutionId) {
      throw new Error("No active execution");
    }
    const result = await this.pg.query(`INSERT INTO phases (
        execution_id,
        name,
        iteration,
        status,
        started_at,
        created_at
      ) VALUES ($1, $2, $3, 'running', NOW(), NOW())
      RETURNING id`, [this.currentExecutionId, name2, iteration]);
    this.currentPhaseId = result.rows[0]?.id ?? "";
    return this.currentPhaseId;
  }
  async completePhase(id) {
    await this.pg.query(`UPDATE phases
       SET status = 'completed',
           completed_at = NOW(),
           duration_ms = EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000
       WHERE id = $1`, [id]);
  }
  async failPhase(id) {
    await this.pg.query(`UPDATE phases
       SET status = 'failed',
           completed_at = NOW(),
           duration_ms = EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000
       WHERE id = $1`, [id]);
  }
  async getCurrentPhase() {
    if (!this.currentPhaseId)
      return null;
    return this.queries.queryOne("SELECT * FROM phases WHERE id = $1", [this.currentPhaseId]);
  }
  async getPhases(executionId) {
    return this.queries.query("SELECT * FROM phases WHERE execution_id = $1 ORDER BY created_at", [executionId]);
  }
  async startAgent(prompt, model = "sonnet", systemPrompt) {
    if (!this.currentExecutionId) {
      throw new Error("No active execution");
    }
    const result = await this.pg.query(`INSERT INTO agents (
        execution_id,
        phase_id,
        model,
        system_prompt,
        prompt,
        status,
        started_at,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, 'running', NOW(), NOW())
      RETURNING id`, [
      this.currentExecutionId,
      this.currentPhaseId,
      model,
      systemPrompt,
      prompt
    ]);
    this.currentAgentId = result.rows[0]?.id ?? "";
    await this.pg.query("UPDATE executions SET total_agents = total_agents + 1 WHERE id = $1", [this.currentExecutionId]);
    return this.currentAgentId;
  }
  async completeAgent(id, result, structuredResult, tokens) {
    await this.pg.query(`UPDATE agents
       SET status = 'completed',
           result = $2,
           result_structured = $3,
           completed_at = NOW(),
           duration_ms = EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000,
           tokens_input = $4,
           tokens_output = $5
       WHERE id = $1`, [
      id,
      result,
      structuredResult ? JSON.stringify(structuredResult) : null,
      tokens?.input,
      tokens?.output
    ]);
    if (tokens) {
      await this.pg.query("UPDATE executions SET total_tokens_used = total_tokens_used + $2 WHERE id = $1", [this.currentExecutionId, tokens.input + tokens.output]);
    }
  }
  async failAgent(id, error2) {
    await this.pg.query(`UPDATE agents
       SET status = 'failed',
           error = $2,
           completed_at = NOW(),
           duration_ms = EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000
       WHERE id = $1`, [id, error2]);
  }
  async getCurrentAgent() {
    if (!this.currentAgentId)
      return null;
    return this.queries.queryOne("SELECT * FROM agents WHERE id = $1", [this.currentAgentId]);
  }
  async getAgents(executionId) {
    return this.queries.query("SELECT * FROM agents WHERE execution_id = $1 ORDER BY created_at", [executionId]);
  }
  async startToolCall(agentId, toolName, input) {
    if (!this.currentExecutionId) {
      throw new Error("No active execution");
    }
    const result = await this.pg.query(`INSERT INTO tool_calls (
        agent_id,
        execution_id,
        tool_name,
        input,
        status,
        started_at,
        created_at
      ) VALUES ($1, $2, $3, $4, 'running', NOW(), NOW())
      RETURNING id`, [agentId, this.currentExecutionId, toolName, JSON.stringify(input)]);
    await Promise.all([
      this.pg.query("UPDATE agents SET tool_calls_count = tool_calls_count + 1 WHERE id = $1", [agentId]),
      this.pg.query("UPDATE executions SET total_tool_calls = total_tool_calls + 1 WHERE id = $1", [this.currentExecutionId])
    ]);
    return result.rows[0]?.id ?? "";
  }
  async completeToolCall(id, output, summary) {
    const outputSize = Buffer.byteLength(output, "utf8");
    if (outputSize <= OUTPUT_INLINE_THRESHOLD) {
      await this.pg.query(`UPDATE tool_calls
         SET status = 'completed',
             output_inline = $2,
             output_size_bytes = $3,
             completed_at = NOW(),
             duration_ms = EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000
         WHERE id = $1`, [id, output, outputSize]);
    } else {
      const outputPath = `.smithers/logs/tool-${id}.txt`;
      await fs6.writeFile(outputPath, output, "utf-8");
      let gitHash = null;
      try {
        const { stdout } = await exec(`git hash-object "${outputPath}"`);
        gitHash = stdout.trim();
      } catch {}
      await this.pg.query(`UPDATE tool_calls
         SET status = 'completed',
             output_path = $2,
             output_git_hash = $3,
             output_summary = $4,
             output_size_bytes = $5,
             completed_at = NOW(),
             duration_ms = EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000
         WHERE id = $1`, [id, outputPath, gitHash, summary, outputSize]);
    }
  }
  async failToolCall(id, error2) {
    await this.pg.query(`UPDATE tool_calls
       SET status = 'failed',
           error = $2,
           completed_at = NOW(),
           duration_ms = EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000
       WHERE id = $1`, [id, error2]);
  }
  async getToolCalls(agentId) {
    return this.queries.query("SELECT * FROM tool_calls WHERE agent_id = $1 ORDER BY created_at", [agentId]);
  }
  async getToolCallOutput(id) {
    const toolCall = await this.queries.queryOne("SELECT * FROM tool_calls WHERE id = $1", [id]);
    if (!toolCall)
      return null;
    if (toolCall.output_inline) {
      return toolCall.output_inline;
    }
    if (toolCall.output_path) {
      try {
        return await fs6.readFile(toolCall.output_path, "utf-8");
      } catch {
        return null;
      }
    }
    return null;
  }
  async addArtifact(name2, type, filePath, agentId, metadata2) {
    if (!this.currentExecutionId) {
      throw new Error("No active execution");
    }
    let gitHash = null;
    let gitCommit = null;
    let lineCount = null;
    let byteSize = null;
    try {
      const { stdout: hashOut } = await exec(`git hash-object "${filePath}"`);
      gitHash = hashOut.trim();
      const { stdout: commitOut } = await exec(`git log -1 --format=%H -- "${filePath}"`);
      gitCommit = commitOut.trim() || null;
      const stats = await fs6.stat(filePath);
      byteSize = stats.size;
      if (type === "code" || type === "file") {
        const content = await fs6.readFile(filePath, "utf-8");
        lineCount = content.split(`
`).length;
      }
    } catch {}
    const result = await this.pg.query(`INSERT INTO artifacts (
        execution_id,
        agent_id,
        name,
        type,
        file_path,
        git_hash,
        git_commit,
        line_count,
        byte_size,
        metadata,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
      RETURNING id`, [
      this.currentExecutionId,
      agentId || this.currentAgentId,
      name2,
      type,
      filePath,
      gitHash,
      gitCommit,
      lineCount,
      byteSize,
      metadata2 ? JSON.stringify(metadata2) : null
    ]);
    return result.rows[0]?.id ?? "";
  }
  async getArtifacts(executionId) {
    return this.queries.query("SELECT * FROM artifacts WHERE execution_id = $1 ORDER BY created_at", [executionId]);
  }
  async startStep(name2) {
    if (!this.currentExecutionId) {
      throw new Error("No active execution");
    }
    const result = await this.pg.query(`INSERT INTO steps (
        execution_id,
        phase_id,
        name,
        status,
        started_at,
        created_at
      ) VALUES ($1, $2, $3, 'running', NOW(), NOW())
      RETURNING id`, [this.currentExecutionId, this.currentPhaseId, name2]);
    this.currentStepId = result.rows[0]?.id ?? "";
    return this.currentStepId;
  }
  async completeStep(id, vcsInfo) {
    await this.pg.query(`UPDATE steps
       SET status = 'completed',
           completed_at = NOW(),
           duration_ms = EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000,
           snapshot_before = $2,
           snapshot_after = $3,
           commit_created = $4
       WHERE id = $1`, [
      id,
      vcsInfo?.snapshot_before ?? null,
      vcsInfo?.snapshot_after ?? null,
      vcsInfo?.commit_created ?? null
    ]);
  }
  async failStep(id) {
    await this.pg.query(`UPDATE steps
       SET status = 'failed',
           completed_at = NOW(),
           duration_ms = EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000
       WHERE id = $1`, [id]);
  }
  async getCurrentStep() {
    if (!this.currentStepId)
      return null;
    return this.queries.queryOne("SELECT * FROM steps WHERE id = $1", [this.currentStepId]);
  }
  async getSteps(phaseId) {
    return this.queries.query("SELECT * FROM steps WHERE phase_id = $1 ORDER BY created_at", [phaseId]);
  }
  async getStepsByExecution(executionId) {
    return this.queries.query("SELECT * FROM steps WHERE execution_id = $1 ORDER BY created_at", [executionId]);
  }
}
var exec, OUTPUT_INLINE_THRESHOLD = 1024;
var init_execution = __esm(() => {
  exec = promisify(execCallback);
});

// src/orchestrator/db/vcs.ts
class VCSManager {
  pg;
  queries;
  currentExecutionId;
  constructor(pg, executionId) {
    this.pg = pg;
    this.queries = new QueryHelpers(pg);
    this.currentExecutionId = executionId;
  }
  async logCommit(commit) {
    const result = await this.pg.query(`INSERT INTO commits (
        execution_id,
        agent_id,
        vcs_type,
        commit_hash,
        change_id,
        message,
        author,
        files_changed,
        insertions,
        deletions,
        smithers_metadata,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
      RETURNING id`, [
      this.currentExecutionId,
      commit.agent_id ?? null,
      commit.vcs_type,
      commit.commit_hash,
      commit.change_id ?? null,
      commit.message,
      commit.author ?? null,
      commit.files_changed ?? null,
      commit.insertions ?? null,
      commit.deletions ?? null,
      commit.smithers_metadata ? JSON.stringify(commit.smithers_metadata) : null
    ]);
    return result.rows[0]?.id ?? "";
  }
  async getCommits(limit = 100) {
    return this.queries.query(`SELECT * FROM commits
       WHERE execution_id = $1
       ORDER BY created_at DESC
       LIMIT $2`, [this.currentExecutionId, limit]);
  }
  async getCommit(hash, vcsType = "git") {
    return this.queries.queryOne("SELECT * FROM commits WHERE commit_hash = $1 AND vcs_type = $2", [hash, vcsType]);
  }
  async logSnapshot(snapshot) {
    const result = await this.pg.query(`INSERT INTO snapshots (
        execution_id,
        change_id,
        commit_hash,
        description,
        files_modified,
        files_added,
        files_deleted,
        has_conflicts,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      RETURNING id`, [
      this.currentExecutionId,
      snapshot.change_id,
      snapshot.commit_hash ?? null,
      snapshot.description ?? null,
      snapshot.files_modified ?? null,
      snapshot.files_added ?? null,
      snapshot.files_deleted ?? null,
      snapshot.has_conflicts ?? false
    ]);
    return result.rows[0]?.id ?? "";
  }
  async getSnapshots(limit = 100) {
    return this.queries.query(`SELECT * FROM snapshots
       WHERE execution_id = $1
       ORDER BY created_at DESC
       LIMIT $2`, [this.currentExecutionId, limit]);
  }
  async logReview(review) {
    const result = await this.pg.query(`INSERT INTO reviews (
        execution_id,
        agent_id,
        target_type,
        target_ref,
        approved,
        summary,
        issues,
        approvals,
        reviewer_model,
        blocking,
        posted_to_github,
        posted_to_git_notes,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, false, false, NOW())
      RETURNING id`, [
      this.currentExecutionId,
      review.agent_id ?? null,
      review.target_type,
      review.target_ref ?? null,
      review.approved,
      review.summary,
      JSON.stringify(review.issues),
      review.approvals ? JSON.stringify(review.approvals) : null,
      review.reviewer_model ?? null,
      review.blocking ?? false
    ]);
    return result.rows[0]?.id ?? "";
  }
  async updateReview(id, updates) {
    const sets = [];
    const params = [];
    if (updates.posted_to_github !== undefined) {
      params.push(updates.posted_to_github);
      sets.push(`posted_to_github = $${params.length}`);
    }
    if (updates.posted_to_git_notes !== undefined) {
      params.push(updates.posted_to_git_notes);
      sets.push(`posted_to_git_notes = $${params.length}`);
    }
    if (sets.length === 0)
      return;
    params.push(id);
    await this.pg.query(`UPDATE reviews SET ${sets.join(", ")} WHERE id = $${params.length}`, params);
  }
  async getReviews(limit = 100) {
    return this.queries.query(`SELECT * FROM reviews
       WHERE execution_id = $1
       ORDER BY created_at DESC
       LIMIT $2`, [this.currentExecutionId, limit]);
  }
  async getBlockingReviews() {
    return this.queries.query(`SELECT * FROM reviews
       WHERE execution_id = $1
       AND blocking = true
       AND approved = false
       ORDER BY created_at DESC`, [this.currentExecutionId]);
  }
  async addReport(report) {
    const result = await this.pg.query(`INSERT INTO reports (
        execution_id,
        agent_id,
        type,
        title,
        content,
        data,
        severity,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      RETURNING id`, [
      this.currentExecutionId,
      report.agent_id ?? null,
      report.type,
      report.title,
      report.content,
      report.data ? JSON.stringify(report.data) : null,
      report.severity ?? "info"
    ]);
    return result.rows[0]?.id ?? "";
  }
  async getReports(type, limit = 100) {
    if (type) {
      return this.queries.query(`SELECT * FROM reports
         WHERE execution_id = $1 AND type = $2
         ORDER BY created_at DESC
         LIMIT $3`, [this.currentExecutionId, type, limit]);
    }
    return this.queries.query(`SELECT * FROM reports
       WHERE execution_id = $1
       ORDER BY created_at DESC
       LIMIT $2`, [this.currentExecutionId, limit]);
  }
  async getCriticalReports() {
    return this.queries.query(`SELECT * FROM reports
       WHERE execution_id = $1 AND severity = 'critical'
       ORDER BY created_at DESC`, [this.currentExecutionId]);
  }
}
var init_vcs = () => {};
// src/orchestrator/db/index.ts
var exports_db = {};
__export(exports_db, {
  createSmithersDB: () => createSmithersDB2
});
import * as fs8 from "fs/promises";
import * as path7 from "path";
import { fileURLToPath as fileURLToPath3 } from "url";
async function createSmithersDB2(options = {}) {
  const pg = await We2.create({
    dataDir: options.path
  });
  if (options.reset) {
    await resetDatabase2(pg);
  }
  await initializeSchema2(pg, options.customSchema);
  const stateManager = new StateManager(pg);
  const memoryManager = new MemoryManager(pg);
  const executionManager = new ExecutionManager(pg);
  const queryHelpers = new QueryHelpers(pg);
  let vcsManager = null;
  const getVCSManager = () => {
    if (!vcsManager) {
      const executionId = executionManager.currentExecutionId;
      if (!executionId) {
        throw new Error("No active execution. Call db.execution.start() first.");
      }
      vcsManager = new VCSManager(pg, executionId);
    }
    return vcsManager;
  };
  const vcsManagers = new Map;
  const db = {
    pg,
    getVCSManager: (executionId) => {
      if (!vcsManagers.has(executionId)) {
        vcsManagers.set(executionId, new VCSManager(pg, executionId));
      }
      return vcsManagers.get(executionId);
    },
    state: {
      get: (key) => stateManager.get(key),
      set: (key, value, trigger) => stateManager.set(key, value, trigger),
      setMany: (updates, trigger) => stateManager.setMany(updates, trigger),
      getAll: () => stateManager.getAll(),
      reset: () => stateManager.reset(),
      history: (key, limit) => key ? stateManager.getHistory(key, limit) : stateManager.getRecentTransitions(limit),
      replayTo: (transitionId) => stateManager.replayTo(transitionId),
      snapshot: () => stateManager.snapshot(),
      restore: (snapshot, trigger) => stateManager.restore(snapshot, trigger)
    },
    memories: {
      add: (memory) => memoryManager.add(memory),
      get: (category, key, scope) => memoryManager.get(category, key, scope),
      list: (category, scope, limit) => memoryManager.list(category, scope, limit),
      search: (query, category, limit) => memoryManager.search(query, category, limit),
      update: (id, updates) => memoryManager.update(id, updates),
      delete: (id) => memoryManager.delete(id),
      addFact: (key, content, source) => memoryManager.addFact(key, content, source),
      addLearning: (key, content, source) => memoryManager.addLearning(key, content, source),
      addPreference: (key, content, scope) => memoryManager.addPreference(key, content, scope),
      stats: () => memoryManager.getStats()
    },
    execution: {
      start: (name2, filePath, config) => executionManager.startExecution(name2, filePath, config),
      complete: (id, result) => executionManager.completeExecution(id, result),
      fail: (id, error2) => executionManager.failExecution(id, error2),
      cancel: (id) => executionManager.cancelExecution(id),
      current: () => executionManager.getCurrentExecution(),
      get: (id) => executionManager.getExecution(id),
      list: (limit) => executionManager.listExecutions(limit),
      findIncomplete: () => executionManager.findIncompleteExecution()
    },
    phases: {
      start: (name2, iteration) => executionManager.startPhase(name2, iteration),
      complete: (id) => executionManager.completePhase(id),
      fail: (id) => executionManager.failPhase(id),
      current: () => executionManager.getCurrentPhase(),
      list: (executionId) => executionManager.getPhases(executionId)
    },
    agents: {
      start: (prompt, model, systemPrompt) => executionManager.startAgent(prompt, model, systemPrompt),
      complete: (id, result, structuredResult, tokens) => executionManager.completeAgent(id, result, structuredResult, tokens),
      fail: (id, error2) => executionManager.failAgent(id, error2),
      current: () => executionManager.getCurrentAgent(),
      list: (executionId) => executionManager.getAgents(executionId)
    },
    steps: {
      start: (name2) => executionManager.startStep(name2),
      complete: (id, vcsInfo) => executionManager.completeStep(id, vcsInfo),
      fail: (id) => executionManager.failStep(id),
      current: () => executionManager.getCurrentStep(),
      list: (phaseId) => executionManager.getSteps(phaseId),
      getByExecution: (executionId) => executionManager.getStepsByExecution(executionId)
    },
    tools: {
      start: (agentId, toolName, input) => executionManager.startToolCall(agentId, toolName, input),
      complete: (id, output, summary) => executionManager.completeToolCall(id, output, summary),
      fail: (id, error2) => executionManager.failToolCall(id, error2),
      list: (agentId) => executionManager.getToolCalls(agentId),
      getOutput: (id) => executionManager.getToolCallOutput(id)
    },
    artifacts: {
      add: (name2, type, filePath, agentId, metadata2) => executionManager.addArtifact(name2, type, filePath, agentId, metadata2),
      list: (executionId) => executionManager.getArtifacts(executionId)
    },
    vcs: {
      logCommit: (commit) => getVCSManager().logCommit(commit),
      getCommits: (limit) => getVCSManager().getCommits(limit),
      getCommit: (hash, vcsType) => getVCSManager().getCommit(hash, vcsType),
      logSnapshot: (snapshot) => getVCSManager().logSnapshot(snapshot),
      getSnapshots: (limit) => getVCSManager().getSnapshots(limit),
      logReview: (review) => getVCSManager().logReview(review),
      updateReview: (id, updates) => getVCSManager().updateReview(id, updates),
      getReviews: (limit) => getVCSManager().getReviews(limit),
      getBlockingReviews: () => getVCSManager().getBlockingReviews(),
      addReport: (report) => getVCSManager().addReport(report),
      getReports: (type, limit) => getVCSManager().getReports(type, limit),
      getCriticalReports: () => getVCSManager().getCriticalReports()
    },
    query: (sql, params) => queryHelpers.query(sql, params),
    close: () => pg.close()
  };
  return db;
}
async function initializeSchema2(pg, customSchema) {
  let schemaPath;
  try {
    const currentFileUrl = import.meta.url;
    if (currentFileUrl.startsWith("file://")) {
      const currentDir = path7.dirname(fileURLToPath3(currentFileUrl));
      schemaPath = path7.join(currentDir, "schema.sql");
    } else {
      schemaPath = path7.resolve(process.cwd(), "src/orchestrator/db/schema.sql");
    }
  } catch {
    schemaPath = path7.resolve(process.cwd(), "src/orchestrator/db/schema.sql");
  }
  const schemaSql = await fs8.readFile(schemaPath, "utf-8");
  await pg.exec(schemaSql);
  if (customSchema) {
    await pg.exec(customSchema);
  }
}
async function resetDatabase2(pg) {
  await pg.exec(`
    DROP TABLE IF EXISTS steps CASCADE;
    DROP TABLE IF EXISTS reviews CASCADE;
    DROP TABLE IF EXISTS snapshots CASCADE;
    DROP TABLE IF EXISTS commits CASCADE;
    DROP TABLE IF EXISTS reports CASCADE;
    DROP TABLE IF EXISTS artifacts CASCADE;
    DROP TABLE IF EXISTS transitions CASCADE;
    DROP TABLE IF EXISTS state CASCADE;
    DROP TABLE IF EXISTS tool_calls CASCADE;
    DROP TABLE IF EXISTS agents CASCADE;
    DROP TABLE IF EXISTS phases CASCADE;
    DROP TABLE IF EXISTS executions CASCADE;
    DROP TABLE IF EXISTS memories CASCADE;
  `);
}
var init_db = __esm(() => {
  init_dist();
  init_state();
  init_memories();
  init_execution();
  init_vcs();
});

// node_modules/commander/esm.mjs
var import__ = __toESM(require_commander(), 1);
var {
  program,
  createCommand,
  createArgument,
  createOption,
  CommanderError,
  InvalidArgumentError,
  InvalidOptionArgumentError,
  Command,
  Argument,
  Option,
  Help
} = import__.default;

// src/orchestrator/commands/init.ts
import * as fs2 from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
function findPackageRoot(startDir) {
  let dir = startDir;
  while (dir !== path.dirname(dir)) {
    if (fs2.existsSync(path.join(dir, "package.json"))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return startDir;
}
async function init2(options = {}) {
  const targetDir = options.dir || process.cwd();
  const smithersDir = path.join(targetDir, ".smithers");
  const logsDir = path.join(smithersDir, "logs");
  const mainFile = path.join(smithersDir, "main.tsx");
  console.log("\uD83D\uDD27 Initializing Smithers orchestration...");
  console.log("");
  if (fs2.existsSync(smithersDir)) {
    console.log("⚠️  .smithers/ directory already exists");
    console.log("");
    console.log("To reinitialize, remove the directory first:");
    console.log(`   rm -rf ${smithersDir}`);
    console.log("");
    process.exit(1);
  }
  fs2.mkdirSync(smithersDir, { recursive: true });
  fs2.mkdirSync(logsDir, { recursive: true });
  const __filename2 = fileURLToPath(import.meta.url);
  const __dirname2 = path.dirname(__filename2);
  const packageRoot = findPackageRoot(__dirname2);
  const templatePath = path.join(packageRoot, "templates/main.tsx.template");
  if (!fs2.existsSync(templatePath)) {
    console.error(`❌ Template not found: ${templatePath}`);
    process.exit(1);
  }
  const templateContent = fs2.readFileSync(templatePath, "utf-8");
  fs2.writeFileSync(mainFile, templateContent);
  fs2.chmodSync(mainFile, "755");
  console.log("✅ Smithers orchestration initialized!");
  console.log("");
  console.log("Created:");
  console.log(`   ${smithersDir}/`);
  console.log(`   ├── main.tsx       ← Your orchestration program`);
  console.log(`   └── logs/          ← Monitor output logs`);
  console.log("");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("");
  console.log("Next steps:");
  console.log("");
  console.log("1. Edit your orchestration:");
  console.log(`   ${mainFile}`);
  console.log("");
  console.log("2. Install Smithers dependencies:");
  console.log("   cd .smithers && bun install smithers zustand");
  console.log("");
  console.log("3. Run with monitoring (recommended):");
  console.log("   bunx smithers monitor");
  console.log("");
  console.log("Or run directly:");
  console.log("   bunx smithers run");
  console.log("");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("");
}

// src/orchestrator/commands/run.ts
import { spawn } from "child_process";
import * as fs3 from "fs";
import * as path2 from "path";
async function run2(fileArg, options = {}) {
  const file = fileArg || options.file || ".smithers/main.tsx";
  const filePath = path2.resolve(file);
  console.log("\uD83D\uDE80 Running Smithers orchestration...");
  console.log(`   File: ${filePath}`);
  console.log("");
  if (!fs3.existsSync(filePath)) {
    console.error(`❌ File not found: ${filePath}`);
    console.log("");
    console.log("Did you run `smithers init` first?");
    console.log("");
    process.exit(1);
  }
  try {
    fs3.accessSync(filePath, fs3.constants.X_OK);
  } catch {
    fs3.chmodSync(filePath, "755");
  }
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("");
  const child = spawn("bun", ["-i", filePath], {
    stdio: "inherit",
    shell: true
  });
  child.on("error", (error) => {
    console.error("");
    console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.error("");
    console.error("❌ Execution failed:", error.message);
    console.error("");
    if (error.message.includes("ENOENT")) {
      console.error("Bun not found. Install it:");
      console.error("   curl -fsSL https://bun.sh/install | bash");
      console.error("");
    }
    process.exit(1);
  });
  child.on("exit", (code) => {
    console.log("");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    if (code === 0) {
      console.log("");
      console.log("✅ Orchestration completed successfully");
      console.log("");
    } else {
      console.log("");
      console.log(`❌ Orchestration exited with code: ${code}`);
      console.log("");
    }
    process.exit(code || 0);
  });
}

// src/orchestrator/commands/monitor.ts
import { spawn as spawn2 } from "child_process";
import * as fs5 from "fs";
import * as path5 from "path";

// src/orchestrator/monitor/output-parser.ts
class OutputParser {
  buffer = "";
  parseChunk(chunk) {
    this.buffer += chunk;
    const lines = this.buffer.split(`
`);
    this.buffer = lines.pop() || "";
    return lines.map((line) => this.parseLine(line)).filter((e) => e !== null);
  }
  parseLine(line) {
    const timestamp = new Date;
    if (line.includes("Phase:") || line.includes("PHASE:")) {
      const match = line.match(/Phase:\s*(.+?)(?:\s*-\s*(.+))?$/);
      if (match) {
        return {
          type: "phase",
          timestamp,
          data: {
            name: match[1].trim(),
            status: match[2]?.trim() || "STARTING"
          },
          raw: line
        };
      }
    }
    if (line.includes("Agent:") || line.includes("AGENT:") || line.includes("Claude")) {
      const match = line.match(/(?:Agent:|Claude)\s*(.+?)(?:\s*-\s*(.+))?$/);
      if (match) {
        return {
          type: "agent",
          timestamp,
          data: {
            name: match[1].trim(),
            status: match[2]?.trim() || "RUNNING"
          },
          raw: line
        };
      }
    }
    if (line.includes("Tool:") || line.includes("TOOL:")) {
      const match = line.match(/Tool:\s*(.+?)(?:\s*-\s*(.+))?$/);
      if (match) {
        return {
          type: "tool",
          timestamp,
          data: {
            name: match[1].trim(),
            details: match[2]?.trim() || ""
          },
          raw: line
        };
      }
    }
    if (line.includes("Iteration") || line.includes("ITERATION")) {
      const match = line.match(/Iteration\s*(\d+)/);
      if (match) {
        return {
          type: "ralph",
          timestamp,
          data: {
            iteration: parseInt(match[1])
          },
          raw: line
        };
      }
    }
    if (line.includes("Error:") || line.includes("ERROR:") || line.match(/^\s*at\s+/)) {
      return {
        type: "error",
        timestamp,
        data: {
          message: line.trim()
        },
        raw: line
      };
    }
    if (line.trim()) {
      return {
        type: "log",
        timestamp,
        data: {
          message: line.trim()
        },
        raw: line
      };
    }
    return null;
  }
  flush() {
    if (!this.buffer.trim())
      return [];
    const event = this.parseLine(this.buffer);
    this.buffer = "";
    return event ? [event] : [];
  }
}

// src/orchestrator/monitor/stream-formatter.ts
class StreamFormatter {
  stats;
  lastEventType = null;
  constructor() {
    this.stats = {
      phasesCompleted: 0,
      agentsExecuted: 0,
      toolCalls: 0,
      errors: 0,
      startTime: new Date
    };
  }
  formatHeader(file) {
    const lines = [
      "╔══════════════════════════════════════════════════════════════════╗",
      "║                    SMITHERS MONITOR v1.0                         ║",
      `║                    File: ${file.padEnd(41)} ║`,
      `║                    Started: ${this.stats.startTime.toISOString().replace("T", " ").substring(0, 19).padEnd(37)} ║`,
      "╚══════════════════════════════════════════════════════════════════╝",
      ""
    ];
    return lines.join(`
`);
  }
  formatEvent(event, logPath, summary) {
    const time = this.formatTime(event.timestamp);
    let output = "";
    switch (event.type) {
      case "phase":
        if (event.data.status === "COMPLETE") {
          this.stats.phasesCompleted++;
        }
        output = this.formatPhase(time, event.data.name, event.data.status);
        break;
      case "agent":
        if (event.data.status === "COMPLETE") {
          this.stats.agentsExecuted++;
        }
        output = this.formatAgent(time, event.data.name, event.data.status);
        break;
      case "tool":
        this.stats.toolCalls++;
        output = this.formatTool(time, event.data.name, event.data.details, logPath, summary);
        break;
      case "ralph":
        output = this.formatRalph(time, event.data.iteration);
        break;
      case "error":
        this.stats.errors++;
        output = this.formatError(time, event.data.message, logPath);
        break;
      case "log":
        if (this.lastEventType !== "log") {
          output = this.formatLog(time, event.data.message);
        }
        break;
      default:
        output = this.formatLog(time, event.raw);
    }
    this.lastEventType = event.type;
    return output;
  }
  formatPhase(time, name2, status) {
    const symbol = status === "COMPLETE" ? "✓" : "◆";
    return `[${time}] ${symbol} PHASE: ${name2}
           Status: ${status}
`;
  }
  formatAgent(time, name2, status) {
    const symbol = status === "COMPLETE" ? "✓" : "●";
    return `[${time}] ${symbol} AGENT: ${name2}
           Status: ${status}
`;
  }
  formatTool(time, name2, details, logPath, summary) {
    let output = `[${time}] ⚡ TOOL CALL: ${name2}
`;
    if (details) {
      output += `           ${details}
`;
    }
    if (summary) {
      output += `           ${"─".repeat(60)}
`;
      output += `           SUMMARY: ${summary.replace(/\n/g, `
           `)}
`;
      output += `           ${"─".repeat(60)}
`;
    }
    if (logPath) {
      output += `           \uD83D\uDCC4 Full output: ${logPath}
`;
    }
    return output + `
`;
  }
  formatRalph(time, iteration) {
    return `[${time}] ↻ RALPH: Iteration ${iteration} complete
           Triggering remount...

`;
  }
  formatError(time, message, logPath) {
    let output = `[${time}] ✗ ERROR: ${message}
`;
    if (logPath) {
      output += `           \uD83D\uDCC4 Full error: ${logPath}
`;
    }
    return output + `
`;
  }
  formatLog(_time2, message) {
    return `           ${message}
`;
  }
  formatSummary(duration, logDir) {
    const lines = [
      "",
      "╔══════════════════════════════════════════════════════════════════╗",
      "║                         EXECUTION SUMMARY                        ║",
      "╠══════════════════════════════════════════════════════════════════╣",
      `║  Duration: ${this.formatDuration(duration).padEnd(56)} ║`,
      `║  Phases completed: ${String(this.stats.phasesCompleted).padEnd(47)} ║`,
      `║  Agents executed: ${String(this.stats.agentsExecuted).padEnd(48)} ║`,
      `║  Tool calls: ${String(this.stats.toolCalls).padEnd(53)} ║`,
      `║  Errors: ${String(this.stats.errors).padEnd(57)} ║`,
      `║  Log directory: ${logDir.padEnd(50)} ║`,
      "╚══════════════════════════════════════════════════════════════════╝",
      ""
    ];
    return lines.join(`
`);
  }
  formatTime(date) {
    return date.toTimeString().substring(0, 8);
  }
  formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }
  getStats() {
    return { ...this.stats };
  }
}

// src/orchestrator/monitor/log-writer.ts
import * as fs4 from "fs";
import * as path3 from "path";

class LogWriter {
  logDir;
  counter = 0;
  sessionId;
  constructor(logDir = ".smithers/logs") {
    this.logDir = path3.resolve(logDir);
    this.sessionId = new Date().toISOString().replace(/[:.]/g, "-");
    if (!fs4.existsSync(this.logDir)) {
      fs4.mkdirSync(this.logDir, { recursive: true });
    }
  }
  writeLog(type, content, metadata2) {
    this.counter++;
    const filename = `${this.sessionId}-${String(this.counter).padStart(3, "0")}-${type}.txt`;
    const filepath = path3.join(this.logDir, filename);
    let output = "";
    if (metadata2) {
      output += "=".repeat(60) + `
`;
      output += `METADATA
`;
      output += "=".repeat(60) + `
`;
      for (const [key, value] of Object.entries(metadata2)) {
        output += `${key}: ${value}
`;
      }
      output += `
`;
      output += "=".repeat(60) + `
`;
      output += `CONTENT
`;
      output += "=".repeat(60) + `
`;
    }
    output += content;
    fs4.writeFileSync(filepath, output, "utf-8");
    return filepath;
  }
  writeToolCall(toolName, input, output) {
    const metadata2 = {
      tool: toolName,
      input: JSON.stringify(input, null, 2),
      timestamp: new Date().toISOString()
    };
    return this.writeLog(`tool-${toolName.toLowerCase()}`, output, metadata2);
  }
  writeAgentResult(agentName, result) {
    const metadata2 = {
      agent: agentName,
      timestamp: new Date().toISOString()
    };
    return this.writeLog("agent-result", result, metadata2);
  }
  writeError(error) {
    const content = error instanceof Error ? error.stack || error.message : error;
    const metadata2 = {
      timestamp: new Date().toISOString()
    };
    return this.writeLog("error", content, metadata2);
  }
  getLogDir() {
    return this.logDir;
  }
  getSessionId() {
    return this.sessionId;
  }
}

// node_modules/@anthropic-ai/sdk/internal/tslib.mjs
function __classPrivateFieldSet(receiver, state, value, kind, f) {
  if (kind === "m")
    throw new TypeError("Private method is not writable");
  if (kind === "a" && !f)
    throw new TypeError("Private accessor was defined without a setter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver))
    throw new TypeError("Cannot write private member to an object whose class did not declare it");
  return kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value), value;
}
function __classPrivateFieldGet(receiver, state, kind, f) {
  if (kind === "a" && !f)
    throw new TypeError("Private accessor was defined without a getter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver))
    throw new TypeError("Cannot read private member from an object whose class did not declare it");
  return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
}

// node_modules/@anthropic-ai/sdk/internal/utils/uuid.mjs
var uuid4 = function() {
  const { crypto: crypto2 } = globalThis;
  if (crypto2?.randomUUID) {
    uuid4 = crypto2.randomUUID.bind(crypto2);
    return crypto2.randomUUID();
  }
  const u8 = new Uint8Array(1);
  const randomByte = crypto2 ? () => crypto2.getRandomValues(u8)[0] : () => Math.random() * 255 & 255;
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (+c ^ randomByte() & 15 >> +c / 4).toString(16));
};

// node_modules/@anthropic-ai/sdk/internal/errors.mjs
function isAbortError(err2) {
  return typeof err2 === "object" && err2 !== null && (("name" in err2) && err2.name === "AbortError" || ("message" in err2) && String(err2.message).includes("FetchRequestCanceledException"));
}
var castToError = (err2) => {
  if (err2 instanceof Error)
    return err2;
  if (typeof err2 === "object" && err2 !== null) {
    try {
      if (Object.prototype.toString.call(err2) === "[object Error]") {
        const error = new Error(err2.message, err2.cause ? { cause: err2.cause } : {});
        if (err2.stack)
          error.stack = err2.stack;
        if (err2.cause && !error.cause)
          error.cause = err2.cause;
        if (err2.name)
          error.name = err2.name;
        return error;
      }
    } catch {}
    try {
      return new Error(JSON.stringify(err2));
    } catch {}
  }
  return new Error(err2);
};

// node_modules/@anthropic-ai/sdk/core/error.mjs
class AnthropicError extends Error {
}

class APIError extends AnthropicError {
  constructor(status, error, message, headers) {
    super(`${APIError.makeMessage(status, error, message)}`);
    this.status = status;
    this.headers = headers;
    this.requestID = headers?.get("request-id");
    this.error = error;
  }
  static makeMessage(status, error, message) {
    const msg = error?.message ? typeof error.message === "string" ? error.message : JSON.stringify(error.message) : error ? JSON.stringify(error) : message;
    if (status && msg) {
      return `${status} ${msg}`;
    }
    if (status) {
      return `${status} status code (no body)`;
    }
    if (msg) {
      return msg;
    }
    return "(no status code or body)";
  }
  static generate(status, errorResponse, message, headers) {
    if (!status || !headers) {
      return new APIConnectionError({ message, cause: castToError(errorResponse) });
    }
    const error = errorResponse;
    if (status === 400) {
      return new BadRequestError(status, error, message, headers);
    }
    if (status === 401) {
      return new AuthenticationError(status, error, message, headers);
    }
    if (status === 403) {
      return new PermissionDeniedError(status, error, message, headers);
    }
    if (status === 404) {
      return new NotFoundError(status, error, message, headers);
    }
    if (status === 409) {
      return new ConflictError(status, error, message, headers);
    }
    if (status === 422) {
      return new UnprocessableEntityError(status, error, message, headers);
    }
    if (status === 429) {
      return new RateLimitError(status, error, message, headers);
    }
    if (status >= 500) {
      return new InternalServerError(status, error, message, headers);
    }
    return new APIError(status, error, message, headers);
  }
}

class APIUserAbortError extends APIError {
  constructor({ message } = {}) {
    super(undefined, undefined, message || "Request was aborted.", undefined);
  }
}

class APIConnectionError extends APIError {
  constructor({ message, cause }) {
    super(undefined, undefined, message || "Connection error.", undefined);
    if (cause)
      this.cause = cause;
  }
}

class APIConnectionTimeoutError extends APIConnectionError {
  constructor({ message } = {}) {
    super({ message: message ?? "Request timed out." });
  }
}

class BadRequestError extends APIError {
}

class AuthenticationError extends APIError {
}

class PermissionDeniedError extends APIError {
}

class NotFoundError extends APIError {
}

class ConflictError extends APIError {
}

class UnprocessableEntityError extends APIError {
}

class RateLimitError extends APIError {
}

class InternalServerError extends APIError {
}

// node_modules/@anthropic-ai/sdk/internal/utils/values.mjs
var startsWithSchemeRegexp = /^[a-z][a-z0-9+.-]*:/i;
var isAbsoluteURL = (url) => {
  return startsWithSchemeRegexp.test(url);
};
var isArray = (val) => (isArray = Array.isArray, isArray(val));
var isReadonlyArray = isArray;
function maybeObj(x) {
  if (typeof x !== "object") {
    return {};
  }
  return x ?? {};
}
function isEmptyObj(obj) {
  if (!obj)
    return true;
  for (const _k in obj)
    return false;
  return true;
}
function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}
var validatePositiveInteger = (name2, n) => {
  if (typeof n !== "number" || !Number.isInteger(n)) {
    throw new AnthropicError(`${name2} must be an integer`);
  }
  if (n < 0) {
    throw new AnthropicError(`${name2} must be a positive integer`);
  }
  return n;
};
var safeJSON = (text) => {
  try {
    return JSON.parse(text);
  } catch (err2) {
    return;
  }
};

// node_modules/@anthropic-ai/sdk/internal/utils/sleep.mjs
var sleep = (ms) => new Promise((resolve3) => setTimeout(resolve3, ms));

// node_modules/@anthropic-ai/sdk/version.mjs
var VERSION = "0.71.2";

// node_modules/@anthropic-ai/sdk/internal/detect-platform.mjs
var isRunningInBrowser = () => {
  return typeof window !== "undefined" && typeof window.document !== "undefined" && typeof navigator !== "undefined";
};
function getDetectedPlatform() {
  if (typeof Deno !== "undefined" && Deno.build != null) {
    return "deno";
  }
  if (typeof EdgeRuntime !== "undefined") {
    return "edge";
  }
  if (Object.prototype.toString.call(typeof globalThis.process !== "undefined" ? globalThis.process : 0) === "[object process]") {
    return "node";
  }
  return "unknown";
}
var getPlatformProperties = () => {
  const detectedPlatform = getDetectedPlatform();
  if (detectedPlatform === "deno") {
    return {
      "X-Stainless-Lang": "js",
      "X-Stainless-Package-Version": VERSION,
      "X-Stainless-OS": normalizePlatform(Deno.build.os),
      "X-Stainless-Arch": normalizeArch(Deno.build.arch),
      "X-Stainless-Runtime": "deno",
      "X-Stainless-Runtime-Version": typeof Deno.version === "string" ? Deno.version : Deno.version?.deno ?? "unknown"
    };
  }
  if (typeof EdgeRuntime !== "undefined") {
    return {
      "X-Stainless-Lang": "js",
      "X-Stainless-Package-Version": VERSION,
      "X-Stainless-OS": "Unknown",
      "X-Stainless-Arch": `other:${EdgeRuntime}`,
      "X-Stainless-Runtime": "edge",
      "X-Stainless-Runtime-Version": globalThis.process.version
    };
  }
  if (detectedPlatform === "node") {
    return {
      "X-Stainless-Lang": "js",
      "X-Stainless-Package-Version": VERSION,
      "X-Stainless-OS": normalizePlatform(globalThis.process.platform ?? "unknown"),
      "X-Stainless-Arch": normalizeArch(globalThis.process.arch ?? "unknown"),
      "X-Stainless-Runtime": "node",
      "X-Stainless-Runtime-Version": globalThis.process.version ?? "unknown"
    };
  }
  const browserInfo = getBrowserInfo();
  if (browserInfo) {
    return {
      "X-Stainless-Lang": "js",
      "X-Stainless-Package-Version": VERSION,
      "X-Stainless-OS": "Unknown",
      "X-Stainless-Arch": "unknown",
      "X-Stainless-Runtime": `browser:${browserInfo.browser}`,
      "X-Stainless-Runtime-Version": browserInfo.version
    };
  }
  return {
    "X-Stainless-Lang": "js",
    "X-Stainless-Package-Version": VERSION,
    "X-Stainless-OS": "Unknown",
    "X-Stainless-Arch": "unknown",
    "X-Stainless-Runtime": "unknown",
    "X-Stainless-Runtime-Version": "unknown"
  };
};
function getBrowserInfo() {
  if (typeof navigator === "undefined" || !navigator) {
    return null;
  }
  const browserPatterns = [
    { key: "edge", pattern: /Edge(?:\W+(\d+)\.(\d+)(?:\.(\d+))?)?/ },
    { key: "ie", pattern: /MSIE(?:\W+(\d+)\.(\d+)(?:\.(\d+))?)?/ },
    { key: "ie", pattern: /Trident(?:.*rv\:(\d+)\.(\d+)(?:\.(\d+))?)?/ },
    { key: "chrome", pattern: /Chrome(?:\W+(\d+)\.(\d+)(?:\.(\d+))?)?/ },
    { key: "firefox", pattern: /Firefox(?:\W+(\d+)\.(\d+)(?:\.(\d+))?)?/ },
    { key: "safari", pattern: /(?:Version\W+(\d+)\.(\d+)(?:\.(\d+))?)?(?:\W+Mobile\S*)?\W+Safari/ }
  ];
  for (const { key, pattern } of browserPatterns) {
    const match = pattern.exec(navigator.userAgent);
    if (match) {
      const major = match[1] || 0;
      const minor = match[2] || 0;
      const patch = match[3] || 0;
      return { browser: key, version: `${major}.${minor}.${patch}` };
    }
  }
  return null;
}
var normalizeArch = (arch) => {
  if (arch === "x32")
    return "x32";
  if (arch === "x86_64" || arch === "x64")
    return "x64";
  if (arch === "arm")
    return "arm";
  if (arch === "aarch64" || arch === "arm64")
    return "arm64";
  if (arch)
    return `other:${arch}`;
  return "unknown";
};
var normalizePlatform = (platform) => {
  platform = platform.toLowerCase();
  if (platform.includes("ios"))
    return "iOS";
  if (platform === "android")
    return "Android";
  if (platform === "darwin")
    return "MacOS";
  if (platform === "win32")
    return "Windows";
  if (platform === "freebsd")
    return "FreeBSD";
  if (platform === "openbsd")
    return "OpenBSD";
  if (platform === "linux")
    return "Linux";
  if (platform)
    return `Other:${platform}`;
  return "Unknown";
};
var _platformHeaders;
var getPlatformHeaders = () => {
  return _platformHeaders ?? (_platformHeaders = getPlatformProperties());
};

// node_modules/@anthropic-ai/sdk/internal/shims.mjs
function getDefaultFetch() {
  if (typeof fetch !== "undefined") {
    return fetch;
  }
  throw new Error("`fetch` is not defined as a global; Either pass `fetch` to the client, `new Anthropic({ fetch })` or polyfill the global, `globalThis.fetch = fetch`");
}
function makeReadableStream(...args2) {
  const ReadableStream = globalThis.ReadableStream;
  if (typeof ReadableStream === "undefined") {
    throw new Error("`ReadableStream` is not defined as a global; You will need to polyfill it, `globalThis.ReadableStream = ReadableStream`");
  }
  return new ReadableStream(...args2);
}
function ReadableStreamFrom(iterable) {
  let iter = Symbol.asyncIterator in iterable ? iterable[Symbol.asyncIterator]() : iterable[Symbol.iterator]();
  return makeReadableStream({
    start() {},
    async pull(controller) {
      const { done, value } = await iter.next();
      if (done) {
        controller.close();
      } else {
        controller.enqueue(value);
      }
    },
    async cancel() {
      await iter.return?.();
    }
  });
}
function ReadableStreamToAsyncIterable(stream) {
  if (stream[Symbol.asyncIterator])
    return stream;
  const reader = stream.getReader();
  return {
    async next() {
      try {
        const result = await reader.read();
        if (result?.done)
          reader.releaseLock();
        return result;
      } catch (e) {
        reader.releaseLock();
        throw e;
      }
    },
    async return() {
      const cancelPromise = reader.cancel();
      reader.releaseLock();
      await cancelPromise;
      return { done: true, value: undefined };
    },
    [Symbol.asyncIterator]() {
      return this;
    }
  };
}
async function CancelReadableStream(stream) {
  if (stream === null || typeof stream !== "object")
    return;
  if (stream[Symbol.asyncIterator]) {
    await stream[Symbol.asyncIterator]().return?.();
    return;
  }
  const reader = stream.getReader();
  const cancelPromise = reader.cancel();
  reader.releaseLock();
  await cancelPromise;
}

// node_modules/@anthropic-ai/sdk/internal/request-options.mjs
var FallbackEncoder = ({ headers, body: body2 }) => {
  return {
    bodyHeaders: {
      "content-type": "application/json"
    },
    body: JSON.stringify(body2)
  };
};

// node_modules/@anthropic-ai/sdk/internal/utils/bytes.mjs
function concatBytes(buffers) {
  let length = 0;
  for (const buffer of buffers) {
    length += buffer.length;
  }
  const output = new Uint8Array(length);
  let index = 0;
  for (const buffer of buffers) {
    output.set(buffer, index);
    index += buffer.length;
  }
  return output;
}
var encodeUTF8_;
function encodeUTF8(str) {
  let encoder;
  return (encodeUTF8_ ?? (encoder = new globalThis.TextEncoder, encodeUTF8_ = encoder.encode.bind(encoder)))(str);
}
var decodeUTF8_;
function decodeUTF8(bytes) {
  let decoder;
  return (decodeUTF8_ ?? (decoder = new globalThis.TextDecoder, decodeUTF8_ = decoder.decode.bind(decoder)))(bytes);
}

// node_modules/@anthropic-ai/sdk/internal/decoders/line.mjs
var _LineDecoder_buffer;
var _LineDecoder_carriageReturnIndex;

class LineDecoder {
  constructor() {
    _LineDecoder_buffer.set(this, undefined);
    _LineDecoder_carriageReturnIndex.set(this, undefined);
    __classPrivateFieldSet(this, _LineDecoder_buffer, new Uint8Array, "f");
    __classPrivateFieldSet(this, _LineDecoder_carriageReturnIndex, null, "f");
  }
  decode(chunk) {
    if (chunk == null) {
      return [];
    }
    const binaryChunk = chunk instanceof ArrayBuffer ? new Uint8Array(chunk) : typeof chunk === "string" ? encodeUTF8(chunk) : chunk;
    __classPrivateFieldSet(this, _LineDecoder_buffer, concatBytes([__classPrivateFieldGet(this, _LineDecoder_buffer, "f"), binaryChunk]), "f");
    const lines = [];
    let patternIndex;
    while ((patternIndex = findNewlineIndex(__classPrivateFieldGet(this, _LineDecoder_buffer, "f"), __classPrivateFieldGet(this, _LineDecoder_carriageReturnIndex, "f"))) != null) {
      if (patternIndex.carriage && __classPrivateFieldGet(this, _LineDecoder_carriageReturnIndex, "f") == null) {
        __classPrivateFieldSet(this, _LineDecoder_carriageReturnIndex, patternIndex.index, "f");
        continue;
      }
      if (__classPrivateFieldGet(this, _LineDecoder_carriageReturnIndex, "f") != null && (patternIndex.index !== __classPrivateFieldGet(this, _LineDecoder_carriageReturnIndex, "f") + 1 || patternIndex.carriage)) {
        lines.push(decodeUTF8(__classPrivateFieldGet(this, _LineDecoder_buffer, "f").subarray(0, __classPrivateFieldGet(this, _LineDecoder_carriageReturnIndex, "f") - 1)));
        __classPrivateFieldSet(this, _LineDecoder_buffer, __classPrivateFieldGet(this, _LineDecoder_buffer, "f").subarray(__classPrivateFieldGet(this, _LineDecoder_carriageReturnIndex, "f")), "f");
        __classPrivateFieldSet(this, _LineDecoder_carriageReturnIndex, null, "f");
        continue;
      }
      const endIndex = __classPrivateFieldGet(this, _LineDecoder_carriageReturnIndex, "f") !== null ? patternIndex.preceding - 1 : patternIndex.preceding;
      const line = decodeUTF8(__classPrivateFieldGet(this, _LineDecoder_buffer, "f").subarray(0, endIndex));
      lines.push(line);
      __classPrivateFieldSet(this, _LineDecoder_buffer, __classPrivateFieldGet(this, _LineDecoder_buffer, "f").subarray(patternIndex.index), "f");
      __classPrivateFieldSet(this, _LineDecoder_carriageReturnIndex, null, "f");
    }
    return lines;
  }
  flush() {
    if (!__classPrivateFieldGet(this, _LineDecoder_buffer, "f").length) {
      return [];
    }
    return this.decode(`
`);
  }
}
_LineDecoder_buffer = new WeakMap, _LineDecoder_carriageReturnIndex = new WeakMap;
LineDecoder.NEWLINE_CHARS = new Set([`
`, "\r"]);
LineDecoder.NEWLINE_REGEXP = /\r\n|[\n\r]/g;
function findNewlineIndex(buffer, startIndex) {
  const newline = 10;
  const carriage = 13;
  for (let i2 = startIndex ?? 0;i2 < buffer.length; i2++) {
    if (buffer[i2] === newline) {
      return { preceding: i2, index: i2 + 1, carriage: false };
    }
    if (buffer[i2] === carriage) {
      return { preceding: i2, index: i2 + 1, carriage: true };
    }
  }
  return null;
}
function findDoubleNewlineIndex(buffer) {
  const newline = 10;
  const carriage = 13;
  for (let i2 = 0;i2 < buffer.length - 1; i2++) {
    if (buffer[i2] === newline && buffer[i2 + 1] === newline) {
      return i2 + 2;
    }
    if (buffer[i2] === carriage && buffer[i2 + 1] === carriage) {
      return i2 + 2;
    }
    if (buffer[i2] === carriage && buffer[i2 + 1] === newline && i2 + 3 < buffer.length && buffer[i2 + 2] === carriage && buffer[i2 + 3] === newline) {
      return i2 + 4;
    }
  }
  return -1;
}

// node_modules/@anthropic-ai/sdk/internal/utils/log.mjs
var levelNumbers = {
  off: 0,
  error: 200,
  warn: 300,
  info: 400,
  debug: 500
};
var parseLogLevel = (maybeLevel, sourceName, client) => {
  if (!maybeLevel) {
    return;
  }
  if (hasOwn(levelNumbers, maybeLevel)) {
    return maybeLevel;
  }
  loggerFor(client).warn(`${sourceName} was set to ${JSON.stringify(maybeLevel)}, expected one of ${JSON.stringify(Object.keys(levelNumbers))}`);
  return;
};
function noop() {}
function makeLogFn(fnLevel, logger, logLevel) {
  if (!logger || levelNumbers[fnLevel] > levelNumbers[logLevel]) {
    return noop;
  } else {
    return logger[fnLevel].bind(logger);
  }
}
var noopLogger = {
  error: noop,
  warn: noop,
  info: noop,
  debug: noop
};
var cachedLoggers = /* @__PURE__ */ new WeakMap;
function loggerFor(client) {
  const logger = client.logger;
  const logLevel = client.logLevel ?? "off";
  if (!logger) {
    return noopLogger;
  }
  const cachedLogger = cachedLoggers.get(logger);
  if (cachedLogger && cachedLogger[0] === logLevel) {
    return cachedLogger[1];
  }
  const levelLogger = {
    error: makeLogFn("error", logger, logLevel),
    warn: makeLogFn("warn", logger, logLevel),
    info: makeLogFn("info", logger, logLevel),
    debug: makeLogFn("debug", logger, logLevel)
  };
  cachedLoggers.set(logger, [logLevel, levelLogger]);
  return levelLogger;
}
var formatRequestDetails = (details) => {
  if (details.options) {
    details.options = { ...details.options };
    delete details.options["headers"];
  }
  if (details.headers) {
    details.headers = Object.fromEntries((details.headers instanceof Headers ? [...details.headers] : Object.entries(details.headers)).map(([name2, value]) => [
      name2,
      name2.toLowerCase() === "x-api-key" || name2.toLowerCase() === "authorization" || name2.toLowerCase() === "cookie" || name2.toLowerCase() === "set-cookie" ? "***" : value
    ]));
  }
  if ("retryOfRequestLogID" in details) {
    if (details.retryOfRequestLogID) {
      details.retryOf = details.retryOfRequestLogID;
    }
    delete details.retryOfRequestLogID;
  }
  return details;
};

// node_modules/@anthropic-ai/sdk/core/streaming.mjs
var _Stream_client;

class Stream {
  constructor(iterator, controller, client) {
    this.iterator = iterator;
    _Stream_client.set(this, undefined);
    this.controller = controller;
    __classPrivateFieldSet(this, _Stream_client, client, "f");
  }
  static fromSSEResponse(response, controller, client) {
    let consumed = false;
    const logger = client ? loggerFor(client) : console;
    async function* iterator() {
      if (consumed) {
        throw new AnthropicError("Cannot iterate over a consumed stream, use `.tee()` to split the stream.");
      }
      consumed = true;
      let done = false;
      try {
        for await (const sse of _iterSSEMessages(response, controller)) {
          if (sse.event === "completion") {
            try {
              yield JSON.parse(sse.data);
            } catch (e) {
              logger.error(`Could not parse message into JSON:`, sse.data);
              logger.error(`From chunk:`, sse.raw);
              throw e;
            }
          }
          if (sse.event === "message_start" || sse.event === "message_delta" || sse.event === "message_stop" || sse.event === "content_block_start" || sse.event === "content_block_delta" || sse.event === "content_block_stop") {
            try {
              yield JSON.parse(sse.data);
            } catch (e) {
              logger.error(`Could not parse message into JSON:`, sse.data);
              logger.error(`From chunk:`, sse.raw);
              throw e;
            }
          }
          if (sse.event === "ping") {
            continue;
          }
          if (sse.event === "error") {
            throw new APIError(undefined, safeJSON(sse.data) ?? sse.data, undefined, response.headers);
          }
        }
        done = true;
      } catch (e) {
        if (isAbortError(e))
          return;
        throw e;
      } finally {
        if (!done)
          controller.abort();
      }
    }
    return new Stream(iterator, controller, client);
  }
  static fromReadableStream(readableStream, controller, client) {
    let consumed = false;
    async function* iterLines() {
      const lineDecoder = new LineDecoder;
      const iter = ReadableStreamToAsyncIterable(readableStream);
      for await (const chunk of iter) {
        for (const line of lineDecoder.decode(chunk)) {
          yield line;
        }
      }
      for (const line of lineDecoder.flush()) {
        yield line;
      }
    }
    async function* iterator() {
      if (consumed) {
        throw new AnthropicError("Cannot iterate over a consumed stream, use `.tee()` to split the stream.");
      }
      consumed = true;
      let done = false;
      try {
        for await (const line of iterLines()) {
          if (done)
            continue;
          if (line)
            yield JSON.parse(line);
        }
        done = true;
      } catch (e) {
        if (isAbortError(e))
          return;
        throw e;
      } finally {
        if (!done)
          controller.abort();
      }
    }
    return new Stream(iterator, controller, client);
  }
  [(_Stream_client = new WeakMap, Symbol.asyncIterator)]() {
    return this.iterator();
  }
  tee() {
    const left = [];
    const right = [];
    const iterator = this.iterator();
    const teeIterator = (queue) => {
      return {
        next: () => {
          if (queue.length === 0) {
            const result = iterator.next();
            left.push(result);
            right.push(result);
          }
          return queue.shift();
        }
      };
    };
    return [
      new Stream(() => teeIterator(left), this.controller, __classPrivateFieldGet(this, _Stream_client, "f")),
      new Stream(() => teeIterator(right), this.controller, __classPrivateFieldGet(this, _Stream_client, "f"))
    ];
  }
  toReadableStream() {
    const self2 = this;
    let iter;
    return makeReadableStream({
      async start() {
        iter = self2[Symbol.asyncIterator]();
      },
      async pull(ctrl) {
        try {
          const { value, done } = await iter.next();
          if (done)
            return ctrl.close();
          const bytes = encodeUTF8(JSON.stringify(value) + `
`);
          ctrl.enqueue(bytes);
        } catch (err2) {
          ctrl.error(err2);
        }
      },
      async cancel() {
        await iter.return?.();
      }
    });
  }
}
async function* _iterSSEMessages(response, controller) {
  if (!response.body) {
    controller.abort();
    if (typeof globalThis.navigator !== "undefined" && globalThis.navigator.product === "ReactNative") {
      throw new AnthropicError(`The default react-native fetch implementation does not support streaming. Please use expo/fetch: https://docs.expo.dev/versions/latest/sdk/expo/#expofetch-api`);
    }
    throw new AnthropicError(`Attempted to iterate over a response with no body`);
  }
  const sseDecoder = new SSEDecoder;
  const lineDecoder = new LineDecoder;
  const iter = ReadableStreamToAsyncIterable(response.body);
  for await (const sseChunk of iterSSEChunks(iter)) {
    for (const line of lineDecoder.decode(sseChunk)) {
      const sse = sseDecoder.decode(line);
      if (sse)
        yield sse;
    }
  }
  for (const line of lineDecoder.flush()) {
    const sse = sseDecoder.decode(line);
    if (sse)
      yield sse;
  }
}
async function* iterSSEChunks(iterator) {
  let data = new Uint8Array;
  for await (const chunk of iterator) {
    if (chunk == null) {
      continue;
    }
    const binaryChunk = chunk instanceof ArrayBuffer ? new Uint8Array(chunk) : typeof chunk === "string" ? encodeUTF8(chunk) : chunk;
    let newData = new Uint8Array(data.length + binaryChunk.length);
    newData.set(data);
    newData.set(binaryChunk, data.length);
    data = newData;
    let patternIndex;
    while ((patternIndex = findDoubleNewlineIndex(data)) !== -1) {
      yield data.slice(0, patternIndex);
      data = data.slice(patternIndex);
    }
  }
  if (data.length > 0) {
    yield data;
  }
}

class SSEDecoder {
  constructor() {
    this.event = null;
    this.data = [];
    this.chunks = [];
  }
  decode(line) {
    if (line.endsWith("\r")) {
      line = line.substring(0, line.length - 1);
    }
    if (!line) {
      if (!this.event && !this.data.length)
        return null;
      const sse = {
        event: this.event,
        data: this.data.join(`
`),
        raw: this.chunks
      };
      this.event = null;
      this.data = [];
      this.chunks = [];
      return sse;
    }
    this.chunks.push(line);
    if (line.startsWith(":")) {
      return null;
    }
    let [fieldname, _, value] = partition(line, ":");
    if (value.startsWith(" ")) {
      value = value.substring(1);
    }
    if (fieldname === "event") {
      this.event = value;
    } else if (fieldname === "data") {
      this.data.push(value);
    }
    return null;
  }
}
function partition(str, delimiter) {
  const index = str.indexOf(delimiter);
  if (index !== -1) {
    return [str.substring(0, index), delimiter, str.substring(index + delimiter.length)];
  }
  return [str, "", ""];
}

// node_modules/@anthropic-ai/sdk/internal/parse.mjs
async function defaultParseResponse(client, props) {
  const { response, requestLogID, retryOfRequestLogID, startTime } = props;
  const body2 = await (async () => {
    if (props.options.stream) {
      loggerFor(client).debug("response", response.status, response.url, response.headers, response.body);
      if (props.options.__streamClass) {
        return props.options.__streamClass.fromSSEResponse(response, props.controller);
      }
      return Stream.fromSSEResponse(response, props.controller);
    }
    if (response.status === 204) {
      return null;
    }
    if (props.options.__binaryResponse) {
      return response;
    }
    const contentType = response.headers.get("content-type");
    const mediaType = contentType?.split(";")[0]?.trim();
    const isJSON = mediaType?.includes("application/json") || mediaType?.endsWith("+json");
    if (isJSON) {
      const json = await response.json();
      return addRequestID(json, response);
    }
    const text = await response.text();
    return text;
  })();
  loggerFor(client).debug(`[${requestLogID}] response parsed`, formatRequestDetails({
    retryOfRequestLogID,
    url: response.url,
    status: response.status,
    body: body2,
    durationMs: Date.now() - startTime
  }));
  return body2;
}
function addRequestID(value, response) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }
  return Object.defineProperty(value, "_request_id", {
    value: response.headers.get("request-id"),
    enumerable: false
  });
}

// node_modules/@anthropic-ai/sdk/core/api-promise.mjs
var _APIPromise_client;

class APIPromise extends Promise {
  constructor(client, responsePromise, parseResponse = defaultParseResponse) {
    super((resolve3) => {
      resolve3(null);
    });
    this.responsePromise = responsePromise;
    this.parseResponse = parseResponse;
    _APIPromise_client.set(this, undefined);
    __classPrivateFieldSet(this, _APIPromise_client, client, "f");
  }
  _thenUnwrap(transform) {
    return new APIPromise(__classPrivateFieldGet(this, _APIPromise_client, "f"), this.responsePromise, async (client, props) => addRequestID(transform(await this.parseResponse(client, props), props), props.response));
  }
  asResponse() {
    return this.responsePromise.then((p) => p.response);
  }
  async withResponse() {
    const [data, response] = await Promise.all([this.parse(), this.asResponse()]);
    return { data, response, request_id: response.headers.get("request-id") };
  }
  parse() {
    if (!this.parsedPromise) {
      this.parsedPromise = this.responsePromise.then((data) => this.parseResponse(__classPrivateFieldGet(this, _APIPromise_client, "f"), data));
    }
    return this.parsedPromise;
  }
  then(onfulfilled, onrejected) {
    return this.parse().then(onfulfilled, onrejected);
  }
  catch(onrejected) {
    return this.parse().catch(onrejected);
  }
  finally(onfinally) {
    return this.parse().finally(onfinally);
  }
}
_APIPromise_client = new WeakMap;

// node_modules/@anthropic-ai/sdk/core/pagination.mjs
var _AbstractPage_client;

class AbstractPage {
  constructor(client, response, body2, options) {
    _AbstractPage_client.set(this, undefined);
    __classPrivateFieldSet(this, _AbstractPage_client, client, "f");
    this.options = options;
    this.response = response;
    this.body = body2;
  }
  hasNextPage() {
    const items = this.getPaginatedItems();
    if (!items.length)
      return false;
    return this.nextPageRequestOptions() != null;
  }
  async getNextPage() {
    const nextOptions = this.nextPageRequestOptions();
    if (!nextOptions) {
      throw new AnthropicError("No next page expected; please check `.hasNextPage()` before calling `.getNextPage()`.");
    }
    return await __classPrivateFieldGet(this, _AbstractPage_client, "f").requestAPIList(this.constructor, nextOptions);
  }
  async* iterPages() {
    let page = this;
    yield page;
    while (page.hasNextPage()) {
      page = await page.getNextPage();
      yield page;
    }
  }
  async* [(_AbstractPage_client = new WeakMap, Symbol.asyncIterator)]() {
    for await (const page of this.iterPages()) {
      for (const item of page.getPaginatedItems()) {
        yield item;
      }
    }
  }
}

class PagePromise extends APIPromise {
  constructor(client, request, Page) {
    super(client, request, async (client2, props) => new Page(client2, props.response, await defaultParseResponse(client2, props), props.options));
  }
  async* [Symbol.asyncIterator]() {
    const page = await this;
    for await (const item of page) {
      yield item;
    }
  }
}

class Page extends AbstractPage {
  constructor(client, response, body2, options) {
    super(client, response, body2, options);
    this.data = body2.data || [];
    this.has_more = body2.has_more || false;
    this.first_id = body2.first_id || null;
    this.last_id = body2.last_id || null;
  }
  getPaginatedItems() {
    return this.data ?? [];
  }
  hasNextPage() {
    if (this.has_more === false) {
      return false;
    }
    return super.hasNextPage();
  }
  nextPageRequestOptions() {
    if (this.options.query?.["before_id"]) {
      const first_id = this.first_id;
      if (!first_id) {
        return null;
      }
      return {
        ...this.options,
        query: {
          ...maybeObj(this.options.query),
          before_id: first_id
        }
      };
    }
    const cursor = this.last_id;
    if (!cursor) {
      return null;
    }
    return {
      ...this.options,
      query: {
        ...maybeObj(this.options.query),
        after_id: cursor
      }
    };
  }
}
class PageCursor extends AbstractPage {
  constructor(client, response, body2, options) {
    super(client, response, body2, options);
    this.data = body2.data || [];
    this.has_more = body2.has_more || false;
    this.next_page = body2.next_page || null;
  }
  getPaginatedItems() {
    return this.data ?? [];
  }
  hasNextPage() {
    if (this.has_more === false) {
      return false;
    }
    return super.hasNextPage();
  }
  nextPageRequestOptions() {
    const cursor = this.next_page;
    if (!cursor) {
      return null;
    }
    return {
      ...this.options,
      query: {
        ...maybeObj(this.options.query),
        page: cursor
      }
    };
  }
}

// node_modules/@anthropic-ai/sdk/internal/uploads.mjs
var checkFileSupport = () => {
  if (typeof File === "undefined") {
    const { process: process2 } = globalThis;
    const isOldNode = typeof process2?.versions?.node === "string" && parseInt(process2.versions.node.split(".")) < 20;
    throw new Error("`File` is not defined as a global, which is required for file uploads." + (isOldNode ? " Update to Node 20 LTS or newer, or set `globalThis.File` to `import('node:buffer').File`." : ""));
  }
};
function makeFile(fileBits, fileName, options) {
  checkFileSupport();
  return new File(fileBits, fileName ?? "unknown_file", options);
}
function getName(value) {
  return (typeof value === "object" && value !== null && (("name" in value) && value.name && String(value.name) || ("url" in value) && value.url && String(value.url) || ("filename" in value) && value.filename && String(value.filename) || ("path" in value) && value.path && String(value.path)) || "").split(/[\\/]/).pop() || undefined;
}
var isAsyncIterable = (value) => value != null && typeof value === "object" && typeof value[Symbol.asyncIterator] === "function";
var multipartFormRequestOptions = async (opts, fetch2) => {
  return { ...opts, body: await createForm(opts.body, fetch2) };
};
var supportsFormDataMap = /* @__PURE__ */ new WeakMap;
function supportsFormData(fetchObject) {
  const fetch2 = typeof fetchObject === "function" ? fetchObject : fetchObject.fetch;
  const cached = supportsFormDataMap.get(fetch2);
  if (cached)
    return cached;
  const promise = (async () => {
    try {
      const FetchResponse = "Response" in fetch2 ? fetch2.Response : (await fetch2("data:,")).constructor;
      const data = new FormData;
      if (data.toString() === await new FetchResponse(data).text()) {
        return false;
      }
      return true;
    } catch {
      return true;
    }
  })();
  supportsFormDataMap.set(fetch2, promise);
  return promise;
}
var createForm = async (body2, fetch2) => {
  if (!await supportsFormData(fetch2)) {
    throw new TypeError("The provided fetch function does not support file uploads with the current global FormData class.");
  }
  const form = new FormData;
  await Promise.all(Object.entries(body2 || {}).map(([key, value]) => addFormValue(form, key, value)));
  return form;
};
var isNamedBlob = (value) => value instanceof Blob && ("name" in value);
var addFormValue = async (form, key, value) => {
  if (value === undefined)
    return;
  if (value == null) {
    throw new TypeError(`Received null for "${key}"; to pass null in FormData, you must use the string 'null'`);
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    form.append(key, String(value));
  } else if (value instanceof Response) {
    let options = {};
    const contentType = value.headers.get("Content-Type");
    if (contentType) {
      options = { type: contentType };
    }
    form.append(key, makeFile([await value.blob()], getName(value), options));
  } else if (isAsyncIterable(value)) {
    form.append(key, makeFile([await new Response(ReadableStreamFrom(value)).blob()], getName(value)));
  } else if (isNamedBlob(value)) {
    form.append(key, makeFile([value], getName(value), { type: value.type }));
  } else if (Array.isArray(value)) {
    await Promise.all(value.map((entry) => addFormValue(form, key + "[]", entry)));
  } else if (typeof value === "object") {
    await Promise.all(Object.entries(value).map(([name2, prop]) => addFormValue(form, `${key}[${name2}]`, prop)));
  } else {
    throw new TypeError(`Invalid value given to form, expected a string, number, boolean, object, Array, File or Blob but got ${value} instead`);
  }
};

// node_modules/@anthropic-ai/sdk/internal/to-file.mjs
var isBlobLike = (value) => value != null && typeof value === "object" && typeof value.size === "number" && typeof value.type === "string" && typeof value.text === "function" && typeof value.slice === "function" && typeof value.arrayBuffer === "function";
var isFileLike = (value) => value != null && typeof value === "object" && typeof value.name === "string" && typeof value.lastModified === "number" && isBlobLike(value);
var isResponseLike = (value) => value != null && typeof value === "object" && typeof value.url === "string" && typeof value.blob === "function";
async function toFile(value, name2, options) {
  checkFileSupport();
  value = await value;
  name2 || (name2 = getName(value));
  if (isFileLike(value)) {
    if (value instanceof File && name2 == null && options == null) {
      return value;
    }
    return makeFile([await value.arrayBuffer()], name2 ?? value.name, {
      type: value.type,
      lastModified: value.lastModified,
      ...options
    });
  }
  if (isResponseLike(value)) {
    const blob = await value.blob();
    name2 || (name2 = new URL(value.url).pathname.split(/[\\/]/).pop());
    return makeFile(await getBytes(blob), name2, options);
  }
  const parts2 = await getBytes(value);
  if (!options?.type) {
    const type = parts2.find((part) => typeof part === "object" && ("type" in part) && part.type);
    if (typeof type === "string") {
      options = { ...options, type };
    }
  }
  return makeFile(parts2, name2, options);
}
async function getBytes(value) {
  let parts2 = [];
  if (typeof value === "string" || ArrayBuffer.isView(value) || value instanceof ArrayBuffer) {
    parts2.push(value);
  } else if (isBlobLike(value)) {
    parts2.push(value instanceof Blob ? value : await value.arrayBuffer());
  } else if (isAsyncIterable(value)) {
    for await (const chunk of value) {
      parts2.push(...await getBytes(chunk));
    }
  } else {
    const constructor = value?.constructor?.name;
    throw new Error(`Unexpected data type: ${typeof value}${constructor ? `; constructor: ${constructor}` : ""}${propsForError(value)}`);
  }
  return parts2;
}
function propsForError(value) {
  if (typeof value !== "object" || value === null)
    return "";
  const props = Object.getOwnPropertyNames(value);
  return `; props: [${props.map((p) => `"${p}"`).join(", ")}]`;
}
// node_modules/@anthropic-ai/sdk/core/resource.mjs
class APIResource {
  constructor(client) {
    this._client = client;
  }
}

// node_modules/@anthropic-ai/sdk/internal/headers.mjs
var brand_privateNullableHeaders = Symbol.for("brand.privateNullableHeaders");
function* iterateHeaders(headers) {
  if (!headers)
    return;
  if (brand_privateNullableHeaders in headers) {
    const { values, nulls } = headers;
    yield* values.entries();
    for (const name2 of nulls) {
      yield [name2, null];
    }
    return;
  }
  let shouldClear = false;
  let iter;
  if (headers instanceof Headers) {
    iter = headers.entries();
  } else if (isReadonlyArray(headers)) {
    iter = headers;
  } else {
    shouldClear = true;
    iter = Object.entries(headers ?? {});
  }
  for (let row of iter) {
    const name2 = row[0];
    if (typeof name2 !== "string")
      throw new TypeError("expected header name to be a string");
    const values = isReadonlyArray(row[1]) ? row[1] : [row[1]];
    let didClear = false;
    for (const value of values) {
      if (value === undefined)
        continue;
      if (shouldClear && !didClear) {
        didClear = true;
        yield [name2, null];
      }
      yield [name2, value];
    }
  }
}
var buildHeaders = (newHeaders) => {
  const targetHeaders = new Headers;
  const nullHeaders = new Set;
  for (const headers of newHeaders) {
    const seenHeaders = new Set;
    for (const [name2, value] of iterateHeaders(headers)) {
      const lowerName = name2.toLowerCase();
      if (!seenHeaders.has(lowerName)) {
        targetHeaders.delete(name2);
        seenHeaders.add(lowerName);
      }
      if (value === null) {
        targetHeaders.delete(name2);
        nullHeaders.add(lowerName);
      } else {
        targetHeaders.append(name2, value);
        nullHeaders.delete(lowerName);
      }
    }
  }
  return { [brand_privateNullableHeaders]: true, values: targetHeaders, nulls: nullHeaders };
};

// node_modules/@anthropic-ai/sdk/internal/utils/path.mjs
function encodeURIPath(str) {
  return str.replace(/[^A-Za-z0-9\-._~!$&'()*+,;=:@]+/g, encodeURIComponent);
}
var EMPTY = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.create(null));
var createPathTagFunction = (pathEncoder = encodeURIPath) => function path(statics, ...params) {
  if (statics.length === 1)
    return statics[0];
  let postPath = false;
  const invalidSegments = [];
  const path4 = statics.reduce((previousValue, currentValue, index) => {
    if (/[?#]/.test(currentValue)) {
      postPath = true;
    }
    const value = params[index];
    let encoded = (postPath ? encodeURIComponent : pathEncoder)("" + value);
    if (index !== params.length && (value == null || typeof value === "object" && value.toString === Object.getPrototypeOf(Object.getPrototypeOf(value.hasOwnProperty ?? EMPTY) ?? EMPTY)?.toString)) {
      encoded = value + "";
      invalidSegments.push({
        start: previousValue.length + currentValue.length,
        length: encoded.length,
        error: `Value of type ${Object.prototype.toString.call(value).slice(8, -1)} is not a valid path parameter`
      });
    }
    return previousValue + currentValue + (index === params.length ? "" : encoded);
  }, "");
  const pathOnly = path4.split(/[?#]/, 1)[0];
  const invalidSegmentPattern = /(?<=^|\/)(?:\.|%2e){1,2}(?=\/|$)/gi;
  let match;
  while ((match = invalidSegmentPattern.exec(pathOnly)) !== null) {
    invalidSegments.push({
      start: match.index,
      length: match[0].length,
      error: `Value "${match[0]}" can't be safely passed as a path parameter`
    });
  }
  invalidSegments.sort((a, b) => a.start - b.start);
  if (invalidSegments.length > 0) {
    let lastEnd = 0;
    const underline = invalidSegments.reduce((acc, segment) => {
      const spaces = " ".repeat(segment.start - lastEnd);
      const arrows = "^".repeat(segment.length);
      lastEnd = segment.start + segment.length;
      return acc + spaces + arrows;
    }, "");
    throw new AnthropicError(`Path parameters result in path with invalid segments:
${invalidSegments.map((e) => e.error).join(`
`)}
${path4}
${underline}`);
  }
  return path4;
};
var path4 = /* @__PURE__ */ createPathTagFunction(encodeURIPath);

// node_modules/@anthropic-ai/sdk/resources/beta/files.mjs
class Files extends APIResource {
  list(params = {}, options) {
    const { betas, ...query } = params ?? {};
    return this._client.getAPIList("/v1/files", Page, {
      query,
      ...options,
      headers: buildHeaders([
        { "anthropic-beta": [...betas ?? [], "files-api-2025-04-14"].toString() },
        options?.headers
      ])
    });
  }
  delete(fileID, params = {}, options) {
    const { betas } = params ?? {};
    return this._client.delete(path4`/v1/files/${fileID}`, {
      ...options,
      headers: buildHeaders([
        { "anthropic-beta": [...betas ?? [], "files-api-2025-04-14"].toString() },
        options?.headers
      ])
    });
  }
  download(fileID, params = {}, options) {
    const { betas } = params ?? {};
    return this._client.get(path4`/v1/files/${fileID}/content`, {
      ...options,
      headers: buildHeaders([
        {
          "anthropic-beta": [...betas ?? [], "files-api-2025-04-14"].toString(),
          Accept: "application/binary"
        },
        options?.headers
      ]),
      __binaryResponse: true
    });
  }
  retrieveMetadata(fileID, params = {}, options) {
    const { betas } = params ?? {};
    return this._client.get(path4`/v1/files/${fileID}`, {
      ...options,
      headers: buildHeaders([
        { "anthropic-beta": [...betas ?? [], "files-api-2025-04-14"].toString() },
        options?.headers
      ])
    });
  }
  upload(params, options) {
    const { betas, ...body2 } = params;
    return this._client.post("/v1/files", multipartFormRequestOptions({
      body: body2,
      ...options,
      headers: buildHeaders([
        { "anthropic-beta": [...betas ?? [], "files-api-2025-04-14"].toString() },
        options?.headers
      ])
    }, this._client));
  }
}

// node_modules/@anthropic-ai/sdk/resources/beta/models.mjs
class Models extends APIResource {
  retrieve(modelID, params = {}, options) {
    const { betas } = params ?? {};
    return this._client.get(path4`/v1/models/${modelID}?beta=true`, {
      ...options,
      headers: buildHeaders([
        { ...betas?.toString() != null ? { "anthropic-beta": betas?.toString() } : undefined },
        options?.headers
      ])
    });
  }
  list(params = {}, options) {
    const { betas, ...query } = params ?? {};
    return this._client.getAPIList("/v1/models?beta=true", Page, {
      query,
      ...options,
      headers: buildHeaders([
        { ...betas?.toString() != null ? { "anthropic-beta": betas?.toString() } : undefined },
        options?.headers
      ])
    });
  }
}

// node_modules/@anthropic-ai/sdk/internal/constants.mjs
var MODEL_NONSTREAMING_TOKENS = {
  "claude-opus-4-20250514": 8192,
  "claude-opus-4-0": 8192,
  "claude-4-opus-20250514": 8192,
  "anthropic.claude-opus-4-20250514-v1:0": 8192,
  "claude-opus-4@20250514": 8192,
  "claude-opus-4-1-20250805": 8192,
  "anthropic.claude-opus-4-1-20250805-v1:0": 8192,
  "claude-opus-4-1@20250805": 8192
};

// node_modules/@anthropic-ai/sdk/lib/beta-parser.mjs
function maybeParseBetaMessage(message, params, opts) {
  if (!params || !("parse" in (params.output_format ?? {}))) {
    return {
      ...message,
      content: message.content.map((block) => {
        if (block.type === "text") {
          const parsedBlock = Object.defineProperty({ ...block }, "parsed_output", {
            value: null,
            enumerable: false
          });
          return Object.defineProperty(parsedBlock, "parsed", {
            get() {
              opts.logger.warn("The `parsed` property on `text` blocks is deprecated, please use `parsed_output` instead.");
              return null;
            },
            enumerable: false
          });
        }
        return block;
      }),
      parsed_output: null
    };
  }
  return parseBetaMessage(message, params, opts);
}
function parseBetaMessage(message, params, opts) {
  let firstParsedOutput = null;
  const content = message.content.map((block) => {
    if (block.type === "text") {
      const parsedOutput = parseBetaOutputFormat(params, block.text);
      if (firstParsedOutput === null) {
        firstParsedOutput = parsedOutput;
      }
      const parsedBlock = Object.defineProperty({ ...block }, "parsed_output", {
        value: parsedOutput,
        enumerable: false
      });
      return Object.defineProperty(parsedBlock, "parsed", {
        get() {
          opts.logger.warn("The `parsed` property on `text` blocks is deprecated, please use `parsed_output` instead.");
          return parsedOutput;
        },
        enumerable: false
      });
    }
    return block;
  });
  return {
    ...message,
    content,
    parsed_output: firstParsedOutput
  };
}
function parseBetaOutputFormat(params, content) {
  if (params.output_format?.type !== "json_schema") {
    return null;
  }
  try {
    if ("parse" in params.output_format) {
      return params.output_format.parse(content);
    }
    return JSON.parse(content);
  } catch (error) {
    throw new AnthropicError(`Failed to parse structured output: ${error}`);
  }
}

// node_modules/@anthropic-ai/sdk/_vendor/partial-json-parser/parser.mjs
var tokenize = (input) => {
  let current = 0;
  let tokens = [];
  while (current < input.length) {
    let char = input[current];
    if (char === "\\") {
      current++;
      continue;
    }
    if (char === "{") {
      tokens.push({
        type: "brace",
        value: "{"
      });
      current++;
      continue;
    }
    if (char === "}") {
      tokens.push({
        type: "brace",
        value: "}"
      });
      current++;
      continue;
    }
    if (char === "[") {
      tokens.push({
        type: "paren",
        value: "["
      });
      current++;
      continue;
    }
    if (char === "]") {
      tokens.push({
        type: "paren",
        value: "]"
      });
      current++;
      continue;
    }
    if (char === ":") {
      tokens.push({
        type: "separator",
        value: ":"
      });
      current++;
      continue;
    }
    if (char === ",") {
      tokens.push({
        type: "delimiter",
        value: ","
      });
      current++;
      continue;
    }
    if (char === '"') {
      let value = "";
      let danglingQuote = false;
      char = input[++current];
      while (char !== '"') {
        if (current === input.length) {
          danglingQuote = true;
          break;
        }
        if (char === "\\") {
          current++;
          if (current === input.length) {
            danglingQuote = true;
            break;
          }
          value += char + input[current];
          char = input[++current];
        } else {
          value += char;
          char = input[++current];
        }
      }
      char = input[++current];
      if (!danglingQuote) {
        tokens.push({
          type: "string",
          value
        });
      }
      continue;
    }
    let WHITESPACE = /\s/;
    if (char && WHITESPACE.test(char)) {
      current++;
      continue;
    }
    let NUMBERS = /[0-9]/;
    if (char && NUMBERS.test(char) || char === "-" || char === ".") {
      let value = "";
      if (char === "-") {
        value += char;
        char = input[++current];
      }
      while (char && NUMBERS.test(char) || char === ".") {
        value += char;
        char = input[++current];
      }
      tokens.push({
        type: "number",
        value
      });
      continue;
    }
    let LETTERS = /[a-z]/i;
    if (char && LETTERS.test(char)) {
      let value = "";
      while (char && LETTERS.test(char)) {
        if (current === input.length) {
          break;
        }
        value += char;
        char = input[++current];
      }
      if (value == "true" || value == "false" || value === "null") {
        tokens.push({
          type: "name",
          value
        });
      } else {
        current++;
        continue;
      }
      continue;
    }
    current++;
  }
  return tokens;
};
var strip = (tokens) => {
  if (tokens.length === 0) {
    return tokens;
  }
  let lastToken = tokens[tokens.length - 1];
  switch (lastToken.type) {
    case "separator":
      tokens = tokens.slice(0, tokens.length - 1);
      return strip(tokens);
      break;
    case "number":
      let lastCharacterOfLastToken = lastToken.value[lastToken.value.length - 1];
      if (lastCharacterOfLastToken === "." || lastCharacterOfLastToken === "-") {
        tokens = tokens.slice(0, tokens.length - 1);
        return strip(tokens);
      }
    case "string":
      let tokenBeforeTheLastToken = tokens[tokens.length - 2];
      if (tokenBeforeTheLastToken?.type === "delimiter") {
        tokens = tokens.slice(0, tokens.length - 1);
        return strip(tokens);
      } else if (tokenBeforeTheLastToken?.type === "brace" && tokenBeforeTheLastToken.value === "{") {
        tokens = tokens.slice(0, tokens.length - 1);
        return strip(tokens);
      }
      break;
    case "delimiter":
      tokens = tokens.slice(0, tokens.length - 1);
      return strip(tokens);
      break;
  }
  return tokens;
};
var unstrip = (tokens) => {
  let tail = [];
  tokens.map((token) => {
    if (token.type === "brace") {
      if (token.value === "{") {
        tail.push("}");
      } else {
        tail.splice(tail.lastIndexOf("}"), 1);
      }
    }
    if (token.type === "paren") {
      if (token.value === "[") {
        tail.push("]");
      } else {
        tail.splice(tail.lastIndexOf("]"), 1);
      }
    }
  });
  if (tail.length > 0) {
    tail.reverse().map((item) => {
      if (item === "}") {
        tokens.push({
          type: "brace",
          value: "}"
        });
      } else if (item === "]") {
        tokens.push({
          type: "paren",
          value: "]"
        });
      }
    });
  }
  return tokens;
};
var generate = (tokens) => {
  let output = "";
  tokens.map((token) => {
    switch (token.type) {
      case "string":
        output += '"' + token.value + '"';
        break;
      default:
        output += token.value;
        break;
    }
  });
  return output;
};
var partialParse = (input) => JSON.parse(generate(unstrip(strip(tokenize(input)))));
// node_modules/@anthropic-ai/sdk/lib/BetaMessageStream.mjs
var _BetaMessageStream_instances;
var _BetaMessageStream_currentMessageSnapshot;
var _BetaMessageStream_params;
var _BetaMessageStream_connectedPromise;
var _BetaMessageStream_resolveConnectedPromise;
var _BetaMessageStream_rejectConnectedPromise;
var _BetaMessageStream_endPromise;
var _BetaMessageStream_resolveEndPromise;
var _BetaMessageStream_rejectEndPromise;
var _BetaMessageStream_listeners;
var _BetaMessageStream_ended;
var _BetaMessageStream_errored;
var _BetaMessageStream_aborted;
var _BetaMessageStream_catchingPromiseCreated;
var _BetaMessageStream_response;
var _BetaMessageStream_request_id;
var _BetaMessageStream_logger;
var _BetaMessageStream_getFinalMessage;
var _BetaMessageStream_getFinalText;
var _BetaMessageStream_handleError;
var _BetaMessageStream_beginRequest;
var _BetaMessageStream_addStreamEvent;
var _BetaMessageStream_endRequest;
var _BetaMessageStream_accumulateMessage;
var JSON_BUF_PROPERTY = "__json_buf";
function tracksToolInput(content) {
  return content.type === "tool_use" || content.type === "server_tool_use" || content.type === "mcp_tool_use";
}

class BetaMessageStream {
  constructor(params, opts) {
    _BetaMessageStream_instances.add(this);
    this.messages = [];
    this.receivedMessages = [];
    _BetaMessageStream_currentMessageSnapshot.set(this, undefined);
    _BetaMessageStream_params.set(this, null);
    this.controller = new AbortController;
    _BetaMessageStream_connectedPromise.set(this, undefined);
    _BetaMessageStream_resolveConnectedPromise.set(this, () => {});
    _BetaMessageStream_rejectConnectedPromise.set(this, () => {});
    _BetaMessageStream_endPromise.set(this, undefined);
    _BetaMessageStream_resolveEndPromise.set(this, () => {});
    _BetaMessageStream_rejectEndPromise.set(this, () => {});
    _BetaMessageStream_listeners.set(this, {});
    _BetaMessageStream_ended.set(this, false);
    _BetaMessageStream_errored.set(this, false);
    _BetaMessageStream_aborted.set(this, false);
    _BetaMessageStream_catchingPromiseCreated.set(this, false);
    _BetaMessageStream_response.set(this, undefined);
    _BetaMessageStream_request_id.set(this, undefined);
    _BetaMessageStream_logger.set(this, undefined);
    _BetaMessageStream_handleError.set(this, (error2) => {
      __classPrivateFieldSet(this, _BetaMessageStream_errored, true, "f");
      if (isAbortError(error2)) {
        error2 = new APIUserAbortError;
      }
      if (error2 instanceof APIUserAbortError) {
        __classPrivateFieldSet(this, _BetaMessageStream_aborted, true, "f");
        return this._emit("abort", error2);
      }
      if (error2 instanceof AnthropicError) {
        return this._emit("error", error2);
      }
      if (error2 instanceof Error) {
        const anthropicError = new AnthropicError(error2.message);
        anthropicError.cause = error2;
        return this._emit("error", anthropicError);
      }
      return this._emit("error", new AnthropicError(String(error2)));
    });
    __classPrivateFieldSet(this, _BetaMessageStream_connectedPromise, new Promise((resolve3, reject) => {
      __classPrivateFieldSet(this, _BetaMessageStream_resolveConnectedPromise, resolve3, "f");
      __classPrivateFieldSet(this, _BetaMessageStream_rejectConnectedPromise, reject, "f");
    }), "f");
    __classPrivateFieldSet(this, _BetaMessageStream_endPromise, new Promise((resolve3, reject) => {
      __classPrivateFieldSet(this, _BetaMessageStream_resolveEndPromise, resolve3, "f");
      __classPrivateFieldSet(this, _BetaMessageStream_rejectEndPromise, reject, "f");
    }), "f");
    __classPrivateFieldGet(this, _BetaMessageStream_connectedPromise, "f").catch(() => {});
    __classPrivateFieldGet(this, _BetaMessageStream_endPromise, "f").catch(() => {});
    __classPrivateFieldSet(this, _BetaMessageStream_params, params, "f");
    __classPrivateFieldSet(this, _BetaMessageStream_logger, opts?.logger ?? console, "f");
  }
  get response() {
    return __classPrivateFieldGet(this, _BetaMessageStream_response, "f");
  }
  get request_id() {
    return __classPrivateFieldGet(this, _BetaMessageStream_request_id, "f");
  }
  async withResponse() {
    __classPrivateFieldSet(this, _BetaMessageStream_catchingPromiseCreated, true, "f");
    const response = await __classPrivateFieldGet(this, _BetaMessageStream_connectedPromise, "f");
    if (!response) {
      throw new Error("Could not resolve a `Response` object");
    }
    return {
      data: this,
      response,
      request_id: response.headers.get("request-id")
    };
  }
  static fromReadableStream(stream) {
    const runner = new BetaMessageStream(null);
    runner._run(() => runner._fromReadableStream(stream));
    return runner;
  }
  static createMessage(messages, params, options, { logger } = {}) {
    const runner = new BetaMessageStream(params, { logger });
    for (const message of params.messages) {
      runner._addMessageParam(message);
    }
    __classPrivateFieldSet(runner, _BetaMessageStream_params, { ...params, stream: true }, "f");
    runner._run(() => runner._createMessage(messages, { ...params, stream: true }, { ...options, headers: { ...options?.headers, "X-Stainless-Helper-Method": "stream" } }));
    return runner;
  }
  _run(executor) {
    executor().then(() => {
      this._emitFinal();
      this._emit("end");
    }, __classPrivateFieldGet(this, _BetaMessageStream_handleError, "f"));
  }
  _addMessageParam(message) {
    this.messages.push(message);
  }
  _addMessage(message, emit = true) {
    this.receivedMessages.push(message);
    if (emit) {
      this._emit("message", message);
    }
  }
  async _createMessage(messages, params, options) {
    const signal = options?.signal;
    let abortHandler;
    if (signal) {
      if (signal.aborted)
        this.controller.abort();
      abortHandler = this.controller.abort.bind(this.controller);
      signal.addEventListener("abort", abortHandler);
    }
    try {
      __classPrivateFieldGet(this, _BetaMessageStream_instances, "m", _BetaMessageStream_beginRequest).call(this);
      const { response, data: stream } = await messages.create({ ...params, stream: true }, { ...options, signal: this.controller.signal }).withResponse();
      this._connected(response);
      for await (const event of stream) {
        __classPrivateFieldGet(this, _BetaMessageStream_instances, "m", _BetaMessageStream_addStreamEvent).call(this, event);
      }
      if (stream.controller.signal?.aborted) {
        throw new APIUserAbortError;
      }
      __classPrivateFieldGet(this, _BetaMessageStream_instances, "m", _BetaMessageStream_endRequest).call(this);
    } finally {
      if (signal && abortHandler) {
        signal.removeEventListener("abort", abortHandler);
      }
    }
  }
  _connected(response) {
    if (this.ended)
      return;
    __classPrivateFieldSet(this, _BetaMessageStream_response, response, "f");
    __classPrivateFieldSet(this, _BetaMessageStream_request_id, response?.headers.get("request-id"), "f");
    __classPrivateFieldGet(this, _BetaMessageStream_resolveConnectedPromise, "f").call(this, response);
    this._emit("connect");
  }
  get ended() {
    return __classPrivateFieldGet(this, _BetaMessageStream_ended, "f");
  }
  get errored() {
    return __classPrivateFieldGet(this, _BetaMessageStream_errored, "f");
  }
  get aborted() {
    return __classPrivateFieldGet(this, _BetaMessageStream_aborted, "f");
  }
  abort() {
    this.controller.abort();
  }
  on(event, listener) {
    const listeners = __classPrivateFieldGet(this, _BetaMessageStream_listeners, "f")[event] || (__classPrivateFieldGet(this, _BetaMessageStream_listeners, "f")[event] = []);
    listeners.push({ listener });
    return this;
  }
  off(event, listener) {
    const listeners = __classPrivateFieldGet(this, _BetaMessageStream_listeners, "f")[event];
    if (!listeners)
      return this;
    const index = listeners.findIndex((l) => l.listener === listener);
    if (index >= 0)
      listeners.splice(index, 1);
    return this;
  }
  once(event, listener) {
    const listeners = __classPrivateFieldGet(this, _BetaMessageStream_listeners, "f")[event] || (__classPrivateFieldGet(this, _BetaMessageStream_listeners, "f")[event] = []);
    listeners.push({ listener, once: true });
    return this;
  }
  emitted(event) {
    return new Promise((resolve3, reject) => {
      __classPrivateFieldSet(this, _BetaMessageStream_catchingPromiseCreated, true, "f");
      if (event !== "error")
        this.once("error", reject);
      this.once(event, resolve3);
    });
  }
  async done() {
    __classPrivateFieldSet(this, _BetaMessageStream_catchingPromiseCreated, true, "f");
    await __classPrivateFieldGet(this, _BetaMessageStream_endPromise, "f");
  }
  get currentMessage() {
    return __classPrivateFieldGet(this, _BetaMessageStream_currentMessageSnapshot, "f");
  }
  async finalMessage() {
    await this.done();
    return __classPrivateFieldGet(this, _BetaMessageStream_instances, "m", _BetaMessageStream_getFinalMessage).call(this);
  }
  async finalText() {
    await this.done();
    return __classPrivateFieldGet(this, _BetaMessageStream_instances, "m", _BetaMessageStream_getFinalText).call(this);
  }
  _emit(event, ...args2) {
    if (__classPrivateFieldGet(this, _BetaMessageStream_ended, "f"))
      return;
    if (event === "end") {
      __classPrivateFieldSet(this, _BetaMessageStream_ended, true, "f");
      __classPrivateFieldGet(this, _BetaMessageStream_resolveEndPromise, "f").call(this);
    }
    const listeners = __classPrivateFieldGet(this, _BetaMessageStream_listeners, "f")[event];
    if (listeners) {
      __classPrivateFieldGet(this, _BetaMessageStream_listeners, "f")[event] = listeners.filter((l) => !l.once);
      listeners.forEach(({ listener }) => listener(...args2));
    }
    if (event === "abort") {
      const error2 = args2[0];
      if (!__classPrivateFieldGet(this, _BetaMessageStream_catchingPromiseCreated, "f") && !listeners?.length) {
        Promise.reject(error2);
      }
      __classPrivateFieldGet(this, _BetaMessageStream_rejectConnectedPromise, "f").call(this, error2);
      __classPrivateFieldGet(this, _BetaMessageStream_rejectEndPromise, "f").call(this, error2);
      this._emit("end");
      return;
    }
    if (event === "error") {
      const error2 = args2[0];
      if (!__classPrivateFieldGet(this, _BetaMessageStream_catchingPromiseCreated, "f") && !listeners?.length) {
        Promise.reject(error2);
      }
      __classPrivateFieldGet(this, _BetaMessageStream_rejectConnectedPromise, "f").call(this, error2);
      __classPrivateFieldGet(this, _BetaMessageStream_rejectEndPromise, "f").call(this, error2);
      this._emit("end");
    }
  }
  _emitFinal() {
    const finalMessage = this.receivedMessages.at(-1);
    if (finalMessage) {
      this._emit("finalMessage", __classPrivateFieldGet(this, _BetaMessageStream_instances, "m", _BetaMessageStream_getFinalMessage).call(this));
    }
  }
  async _fromReadableStream(readableStream, options) {
    const signal = options?.signal;
    let abortHandler;
    if (signal) {
      if (signal.aborted)
        this.controller.abort();
      abortHandler = this.controller.abort.bind(this.controller);
      signal.addEventListener("abort", abortHandler);
    }
    try {
      __classPrivateFieldGet(this, _BetaMessageStream_instances, "m", _BetaMessageStream_beginRequest).call(this);
      this._connected(null);
      const stream = Stream.fromReadableStream(readableStream, this.controller);
      for await (const event of stream) {
        __classPrivateFieldGet(this, _BetaMessageStream_instances, "m", _BetaMessageStream_addStreamEvent).call(this, event);
      }
      if (stream.controller.signal?.aborted) {
        throw new APIUserAbortError;
      }
      __classPrivateFieldGet(this, _BetaMessageStream_instances, "m", _BetaMessageStream_endRequest).call(this);
    } finally {
      if (signal && abortHandler) {
        signal.removeEventListener("abort", abortHandler);
      }
    }
  }
  [(_BetaMessageStream_currentMessageSnapshot = new WeakMap, _BetaMessageStream_params = new WeakMap, _BetaMessageStream_connectedPromise = new WeakMap, _BetaMessageStream_resolveConnectedPromise = new WeakMap, _BetaMessageStream_rejectConnectedPromise = new WeakMap, _BetaMessageStream_endPromise = new WeakMap, _BetaMessageStream_resolveEndPromise = new WeakMap, _BetaMessageStream_rejectEndPromise = new WeakMap, _BetaMessageStream_listeners = new WeakMap, _BetaMessageStream_ended = new WeakMap, _BetaMessageStream_errored = new WeakMap, _BetaMessageStream_aborted = new WeakMap, _BetaMessageStream_catchingPromiseCreated = new WeakMap, _BetaMessageStream_response = new WeakMap, _BetaMessageStream_request_id = new WeakMap, _BetaMessageStream_logger = new WeakMap, _BetaMessageStream_handleError = new WeakMap, _BetaMessageStream_instances = new WeakSet, _BetaMessageStream_getFinalMessage = function _BetaMessageStream_getFinalMessage() {
    if (this.receivedMessages.length === 0) {
      throw new AnthropicError("stream ended without producing a Message with role=assistant");
    }
    return this.receivedMessages.at(-1);
  }, _BetaMessageStream_getFinalText = function _BetaMessageStream_getFinalText() {
    if (this.receivedMessages.length === 0) {
      throw new AnthropicError("stream ended without producing a Message with role=assistant");
    }
    const textBlocks = this.receivedMessages.at(-1).content.filter((block) => block.type === "text").map((block) => block.text);
    if (textBlocks.length === 0) {
      throw new AnthropicError("stream ended without producing a content block with type=text");
    }
    return textBlocks.join(" ");
  }, _BetaMessageStream_beginRequest = function _BetaMessageStream_beginRequest() {
    if (this.ended)
      return;
    __classPrivateFieldSet(this, _BetaMessageStream_currentMessageSnapshot, undefined, "f");
  }, _BetaMessageStream_addStreamEvent = function _BetaMessageStream_addStreamEvent(event) {
    if (this.ended)
      return;
    const messageSnapshot = __classPrivateFieldGet(this, _BetaMessageStream_instances, "m", _BetaMessageStream_accumulateMessage).call(this, event);
    this._emit("streamEvent", event, messageSnapshot);
    switch (event.type) {
      case "content_block_delta": {
        const content = messageSnapshot.content.at(-1);
        switch (event.delta.type) {
          case "text_delta": {
            if (content.type === "text") {
              this._emit("text", event.delta.text, content.text || "");
            }
            break;
          }
          case "citations_delta": {
            if (content.type === "text") {
              this._emit("citation", event.delta.citation, content.citations ?? []);
            }
            break;
          }
          case "input_json_delta": {
            if (tracksToolInput(content) && content.input) {
              this._emit("inputJson", event.delta.partial_json, content.input);
            }
            break;
          }
          case "thinking_delta": {
            if (content.type === "thinking") {
              this._emit("thinking", event.delta.thinking, content.thinking);
            }
            break;
          }
          case "signature_delta": {
            if (content.type === "thinking") {
              this._emit("signature", content.signature);
            }
            break;
          }
          default:
            checkNever(event.delta);
        }
        break;
      }
      case "message_stop": {
        this._addMessageParam(messageSnapshot);
        this._addMessage(maybeParseBetaMessage(messageSnapshot, __classPrivateFieldGet(this, _BetaMessageStream_params, "f"), { logger: __classPrivateFieldGet(this, _BetaMessageStream_logger, "f") }), true);
        break;
      }
      case "content_block_stop": {
        this._emit("contentBlock", messageSnapshot.content.at(-1));
        break;
      }
      case "message_start": {
        __classPrivateFieldSet(this, _BetaMessageStream_currentMessageSnapshot, messageSnapshot, "f");
        break;
      }
      case "content_block_start":
      case "message_delta":
        break;
    }
  }, _BetaMessageStream_endRequest = function _BetaMessageStream_endRequest() {
    if (this.ended) {
      throw new AnthropicError(`stream has ended, this shouldn't happen`);
    }
    const snapshot = __classPrivateFieldGet(this, _BetaMessageStream_currentMessageSnapshot, "f");
    if (!snapshot) {
      throw new AnthropicError(`request ended without sending any chunks`);
    }
    __classPrivateFieldSet(this, _BetaMessageStream_currentMessageSnapshot, undefined, "f");
    return maybeParseBetaMessage(snapshot, __classPrivateFieldGet(this, _BetaMessageStream_params, "f"), { logger: __classPrivateFieldGet(this, _BetaMessageStream_logger, "f") });
  }, _BetaMessageStream_accumulateMessage = function _BetaMessageStream_accumulateMessage(event) {
    let snapshot = __classPrivateFieldGet(this, _BetaMessageStream_currentMessageSnapshot, "f");
    if (event.type === "message_start") {
      if (snapshot) {
        throw new AnthropicError(`Unexpected event order, got ${event.type} before receiving "message_stop"`);
      }
      return event.message;
    }
    if (!snapshot) {
      throw new AnthropicError(`Unexpected event order, got ${event.type} before "message_start"`);
    }
    switch (event.type) {
      case "message_stop":
        return snapshot;
      case "message_delta":
        snapshot.container = event.delta.container;
        snapshot.stop_reason = event.delta.stop_reason;
        snapshot.stop_sequence = event.delta.stop_sequence;
        snapshot.usage.output_tokens = event.usage.output_tokens;
        snapshot.context_management = event.context_management;
        if (event.usage.input_tokens != null) {
          snapshot.usage.input_tokens = event.usage.input_tokens;
        }
        if (event.usage.cache_creation_input_tokens != null) {
          snapshot.usage.cache_creation_input_tokens = event.usage.cache_creation_input_tokens;
        }
        if (event.usage.cache_read_input_tokens != null) {
          snapshot.usage.cache_read_input_tokens = event.usage.cache_read_input_tokens;
        }
        if (event.usage.server_tool_use != null) {
          snapshot.usage.server_tool_use = event.usage.server_tool_use;
        }
        return snapshot;
      case "content_block_start":
        snapshot.content.push(event.content_block);
        return snapshot;
      case "content_block_delta": {
        const snapshotContent = snapshot.content.at(event.index);
        switch (event.delta.type) {
          case "text_delta": {
            if (snapshotContent?.type === "text") {
              snapshot.content[event.index] = {
                ...snapshotContent,
                text: (snapshotContent.text || "") + event.delta.text
              };
            }
            break;
          }
          case "citations_delta": {
            if (snapshotContent?.type === "text") {
              snapshot.content[event.index] = {
                ...snapshotContent,
                citations: [...snapshotContent.citations ?? [], event.delta.citation]
              };
            }
            break;
          }
          case "input_json_delta": {
            if (snapshotContent && tracksToolInput(snapshotContent)) {
              let jsonBuf = snapshotContent[JSON_BUF_PROPERTY] || "";
              jsonBuf += event.delta.partial_json;
              const newContent = { ...snapshotContent };
              Object.defineProperty(newContent, JSON_BUF_PROPERTY, {
                value: jsonBuf,
                enumerable: false,
                writable: true
              });
              if (jsonBuf) {
                try {
                  newContent.input = partialParse(jsonBuf);
                } catch (err2) {
                  const error2 = new AnthropicError(`Unable to parse tool parameter JSON from model. Please retry your request or adjust your prompt. Error: ${err2}. JSON: ${jsonBuf}`);
                  __classPrivateFieldGet(this, _BetaMessageStream_handleError, "f").call(this, error2);
                }
              }
              snapshot.content[event.index] = newContent;
            }
            break;
          }
          case "thinking_delta": {
            if (snapshotContent?.type === "thinking") {
              snapshot.content[event.index] = {
                ...snapshotContent,
                thinking: snapshotContent.thinking + event.delta.thinking
              };
            }
            break;
          }
          case "signature_delta": {
            if (snapshotContent?.type === "thinking") {
              snapshot.content[event.index] = {
                ...snapshotContent,
                signature: event.delta.signature
              };
            }
            break;
          }
          default:
            checkNever(event.delta);
        }
        return snapshot;
      }
      case "content_block_stop":
        return snapshot;
    }
  }, Symbol.asyncIterator)]() {
    const pushQueue = [];
    const readQueue = [];
    let done = false;
    this.on("streamEvent", (event) => {
      const reader = readQueue.shift();
      if (reader) {
        reader.resolve(event);
      } else {
        pushQueue.push(event);
      }
    });
    this.on("end", () => {
      done = true;
      for (const reader of readQueue) {
        reader.resolve(undefined);
      }
      readQueue.length = 0;
    });
    this.on("abort", (err2) => {
      done = true;
      for (const reader of readQueue) {
        reader.reject(err2);
      }
      readQueue.length = 0;
    });
    this.on("error", (err2) => {
      done = true;
      for (const reader of readQueue) {
        reader.reject(err2);
      }
      readQueue.length = 0;
    });
    return {
      next: async () => {
        if (!pushQueue.length) {
          if (done) {
            return { value: undefined, done: true };
          }
          return new Promise((resolve3, reject) => readQueue.push({ resolve: resolve3, reject })).then((chunk2) => chunk2 ? { value: chunk2, done: false } : { value: undefined, done: true });
        }
        const chunk = pushQueue.shift();
        return { value: chunk, done: false };
      },
      return: async () => {
        this.abort();
        return { value: undefined, done: true };
      }
    };
  }
  toReadableStream() {
    const stream = new Stream(this[Symbol.asyncIterator].bind(this), this.controller);
    return stream.toReadableStream();
  }
}
function checkNever(x) {}

// node_modules/@anthropic-ai/sdk/lib/tools/CompactionControl.mjs
var DEFAULT_TOKEN_THRESHOLD = 1e5;
var DEFAULT_SUMMARY_PROMPT = `You have been working on the task described above but have not yet completed it. Write a continuation summary that will allow you (or another instance of yourself) to resume work efficiently in a future context window where the conversation history will be replaced with this summary. Your summary should be structured, concise, and actionable. Include:
1. Task Overview
The user's core request and success criteria
Any clarifications or constraints they specified
2. Current State
What has been completed so far
Files created, modified, or analyzed (with paths if relevant)
Key outputs or artifacts produced
3. Important Discoveries
Technical constraints or requirements uncovered
Decisions made and their rationale
Errors encountered and how they were resolved
What approaches were tried that didn't work (and why)
4. Next Steps
Specific actions needed to complete the task
Any blockers or open questions to resolve
Priority order if multiple steps remain
5. Context to Preserve
User preferences or style requirements
Domain-specific details that aren't obvious
Any promises made to the user
Be concise but complete—err on the side of including information that would prevent duplicate work or repeated mistakes. Write in a way that enables immediate resumption of the task.
Wrap your summary in <summary></summary> tags.`;

// node_modules/@anthropic-ai/sdk/lib/tools/BetaToolRunner.mjs
var _BetaToolRunner_instances;
var _BetaToolRunner_consumed;
var _BetaToolRunner_mutated;
var _BetaToolRunner_state;
var _BetaToolRunner_options;
var _BetaToolRunner_message;
var _BetaToolRunner_toolResponse;
var _BetaToolRunner_completion;
var _BetaToolRunner_iterationCount;
var _BetaToolRunner_checkAndCompact;
var _BetaToolRunner_generateToolResponse;
function promiseWithResolvers() {
  let resolve3;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve3 = res;
    reject = rej;
  });
  return { promise, resolve: resolve3, reject };
}

class BetaToolRunner {
  constructor(client, params, options) {
    _BetaToolRunner_instances.add(this);
    this.client = client;
    _BetaToolRunner_consumed.set(this, false);
    _BetaToolRunner_mutated.set(this, false);
    _BetaToolRunner_state.set(this, undefined);
    _BetaToolRunner_options.set(this, undefined);
    _BetaToolRunner_message.set(this, undefined);
    _BetaToolRunner_toolResponse.set(this, undefined);
    _BetaToolRunner_completion.set(this, undefined);
    _BetaToolRunner_iterationCount.set(this, 0);
    __classPrivateFieldSet(this, _BetaToolRunner_state, {
      params: {
        ...params,
        messages: structuredClone(params.messages)
      }
    }, "f");
    __classPrivateFieldSet(this, _BetaToolRunner_options, {
      ...options,
      headers: buildHeaders([{ "x-stainless-helper": "BetaToolRunner" }, options?.headers])
    }, "f");
    __classPrivateFieldSet(this, _BetaToolRunner_completion, promiseWithResolvers(), "f");
  }
  async* [(_BetaToolRunner_consumed = new WeakMap, _BetaToolRunner_mutated = new WeakMap, _BetaToolRunner_state = new WeakMap, _BetaToolRunner_options = new WeakMap, _BetaToolRunner_message = new WeakMap, _BetaToolRunner_toolResponse = new WeakMap, _BetaToolRunner_completion = new WeakMap, _BetaToolRunner_iterationCount = new WeakMap, _BetaToolRunner_instances = new WeakSet, _BetaToolRunner_checkAndCompact = async function _BetaToolRunner_checkAndCompact() {
    const compactionControl = __classPrivateFieldGet(this, _BetaToolRunner_state, "f").params.compactionControl;
    if (!compactionControl || !compactionControl.enabled) {
      return false;
    }
    let tokensUsed = 0;
    if (__classPrivateFieldGet(this, _BetaToolRunner_message, "f") !== undefined) {
      try {
        const message = await __classPrivateFieldGet(this, _BetaToolRunner_message, "f");
        const totalInputTokens = message.usage.input_tokens + (message.usage.cache_creation_input_tokens ?? 0) + (message.usage.cache_read_input_tokens ?? 0);
        tokensUsed = totalInputTokens + message.usage.output_tokens;
      } catch {
        return false;
      }
    }
    const threshold = compactionControl.contextTokenThreshold ?? DEFAULT_TOKEN_THRESHOLD;
    if (tokensUsed < threshold) {
      return false;
    }
    const model = compactionControl.model ?? __classPrivateFieldGet(this, _BetaToolRunner_state, "f").params.model;
    const summaryPrompt = compactionControl.summaryPrompt ?? DEFAULT_SUMMARY_PROMPT;
    const messages = __classPrivateFieldGet(this, _BetaToolRunner_state, "f").params.messages;
    if (messages[messages.length - 1].role === "assistant") {
      const lastMessage = messages[messages.length - 1];
      if (Array.isArray(lastMessage.content)) {
        const nonToolBlocks = lastMessage.content.filter((block) => block.type !== "tool_use");
        if (nonToolBlocks.length === 0) {
          messages.pop();
        } else {
          lastMessage.content = nonToolBlocks;
        }
      }
    }
    const response = await this.client.beta.messages.create({
      model,
      messages: [
        ...messages,
        {
          role: "user",
          content: [
            {
              type: "text",
              text: summaryPrompt
            }
          ]
        }
      ],
      max_tokens: __classPrivateFieldGet(this, _BetaToolRunner_state, "f").params.max_tokens
    }, {
      headers: { "x-stainless-helper": "compaction" }
    });
    if (response.content[0]?.type !== "text") {
      throw new AnthropicError("Expected text response for compaction");
    }
    __classPrivateFieldGet(this, _BetaToolRunner_state, "f").params.messages = [
      {
        role: "user",
        content: response.content
      }
    ];
    return true;
  }, Symbol.asyncIterator)]() {
    var _a;
    if (__classPrivateFieldGet(this, _BetaToolRunner_consumed, "f")) {
      throw new AnthropicError("Cannot iterate over a consumed stream");
    }
    __classPrivateFieldSet(this, _BetaToolRunner_consumed, true, "f");
    __classPrivateFieldSet(this, _BetaToolRunner_mutated, true, "f");
    __classPrivateFieldSet(this, _BetaToolRunner_toolResponse, undefined, "f");
    try {
      while (true) {
        let stream;
        try {
          if (__classPrivateFieldGet(this, _BetaToolRunner_state, "f").params.max_iterations && __classPrivateFieldGet(this, _BetaToolRunner_iterationCount, "f") >= __classPrivateFieldGet(this, _BetaToolRunner_state, "f").params.max_iterations) {
            break;
          }
          __classPrivateFieldSet(this, _BetaToolRunner_mutated, false, "f");
          __classPrivateFieldSet(this, _BetaToolRunner_toolResponse, undefined, "f");
          __classPrivateFieldSet(this, _BetaToolRunner_iterationCount, (_a = __classPrivateFieldGet(this, _BetaToolRunner_iterationCount, "f"), _a++, _a), "f");
          __classPrivateFieldSet(this, _BetaToolRunner_message, undefined, "f");
          const { max_iterations, compactionControl, ...params } = __classPrivateFieldGet(this, _BetaToolRunner_state, "f").params;
          if (params.stream) {
            stream = this.client.beta.messages.stream({ ...params }, __classPrivateFieldGet(this, _BetaToolRunner_options, "f"));
            __classPrivateFieldSet(this, _BetaToolRunner_message, stream.finalMessage(), "f");
            __classPrivateFieldGet(this, _BetaToolRunner_message, "f").catch(() => {});
            yield stream;
          } else {
            __classPrivateFieldSet(this, _BetaToolRunner_message, this.client.beta.messages.create({ ...params, stream: false }, __classPrivateFieldGet(this, _BetaToolRunner_options, "f")), "f");
            yield __classPrivateFieldGet(this, _BetaToolRunner_message, "f");
          }
          const isCompacted = await __classPrivateFieldGet(this, _BetaToolRunner_instances, "m", _BetaToolRunner_checkAndCompact).call(this);
          if (!isCompacted) {
            if (!__classPrivateFieldGet(this, _BetaToolRunner_mutated, "f")) {
              const { role, content } = await __classPrivateFieldGet(this, _BetaToolRunner_message, "f");
              __classPrivateFieldGet(this, _BetaToolRunner_state, "f").params.messages.push({ role, content });
            }
            const toolMessage = await __classPrivateFieldGet(this, _BetaToolRunner_instances, "m", _BetaToolRunner_generateToolResponse).call(this, __classPrivateFieldGet(this, _BetaToolRunner_state, "f").params.messages.at(-1));
            if (toolMessage) {
              __classPrivateFieldGet(this, _BetaToolRunner_state, "f").params.messages.push(toolMessage);
            } else if (!__classPrivateFieldGet(this, _BetaToolRunner_mutated, "f")) {
              break;
            }
          }
        } finally {
          if (stream) {
            stream.abort();
          }
        }
      }
      if (!__classPrivateFieldGet(this, _BetaToolRunner_message, "f")) {
        throw new AnthropicError("ToolRunner concluded without a message from the server");
      }
      __classPrivateFieldGet(this, _BetaToolRunner_completion, "f").resolve(await __classPrivateFieldGet(this, _BetaToolRunner_message, "f"));
    } catch (error2) {
      __classPrivateFieldSet(this, _BetaToolRunner_consumed, false, "f");
      __classPrivateFieldGet(this, _BetaToolRunner_completion, "f").promise.catch(() => {});
      __classPrivateFieldGet(this, _BetaToolRunner_completion, "f").reject(error2);
      __classPrivateFieldSet(this, _BetaToolRunner_completion, promiseWithResolvers(), "f");
      throw error2;
    }
  }
  setMessagesParams(paramsOrMutator) {
    if (typeof paramsOrMutator === "function") {
      __classPrivateFieldGet(this, _BetaToolRunner_state, "f").params = paramsOrMutator(__classPrivateFieldGet(this, _BetaToolRunner_state, "f").params);
    } else {
      __classPrivateFieldGet(this, _BetaToolRunner_state, "f").params = paramsOrMutator;
    }
    __classPrivateFieldSet(this, _BetaToolRunner_mutated, true, "f");
    __classPrivateFieldSet(this, _BetaToolRunner_toolResponse, undefined, "f");
  }
  async generateToolResponse() {
    const message = await __classPrivateFieldGet(this, _BetaToolRunner_message, "f") ?? this.params.messages.at(-1);
    if (!message) {
      return null;
    }
    return __classPrivateFieldGet(this, _BetaToolRunner_instances, "m", _BetaToolRunner_generateToolResponse).call(this, message);
  }
  done() {
    return __classPrivateFieldGet(this, _BetaToolRunner_completion, "f").promise;
  }
  async runUntilDone() {
    if (!__classPrivateFieldGet(this, _BetaToolRunner_consumed, "f")) {
      for await (const _ of this) {}
    }
    return this.done();
  }
  get params() {
    return __classPrivateFieldGet(this, _BetaToolRunner_state, "f").params;
  }
  pushMessages(...messages) {
    this.setMessagesParams((params) => ({
      ...params,
      messages: [...params.messages, ...messages]
    }));
  }
  then(onfulfilled, onrejected) {
    return this.runUntilDone().then(onfulfilled, onrejected);
  }
}
_BetaToolRunner_generateToolResponse = async function _BetaToolRunner_generateToolResponse2(lastMessage) {
  if (__classPrivateFieldGet(this, _BetaToolRunner_toolResponse, "f") !== undefined) {
    return __classPrivateFieldGet(this, _BetaToolRunner_toolResponse, "f");
  }
  __classPrivateFieldSet(this, _BetaToolRunner_toolResponse, generateToolResponse(__classPrivateFieldGet(this, _BetaToolRunner_state, "f").params, lastMessage), "f");
  return __classPrivateFieldGet(this, _BetaToolRunner_toolResponse, "f");
};
async function generateToolResponse(params, lastMessage = params.messages.at(-1)) {
  if (!lastMessage || lastMessage.role !== "assistant" || !lastMessage.content || typeof lastMessage.content === "string") {
    return null;
  }
  const toolUseBlocks = lastMessage.content.filter((content) => content.type === "tool_use");
  if (toolUseBlocks.length === 0) {
    return null;
  }
  const toolResults = await Promise.all(toolUseBlocks.map(async (toolUse) => {
    const tool = params.tools.find((t) => ("name" in t ? t.name : t.mcp_server_name) === toolUse.name);
    if (!tool || !("run" in tool)) {
      return {
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: `Error: Tool '${toolUse.name}' not found`,
        is_error: true
      };
    }
    try {
      let input = toolUse.input;
      if ("parse" in tool && tool.parse) {
        input = tool.parse(input);
      }
      const result = await tool.run(input);
      return {
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: result
      };
    } catch (error2) {
      return {
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: `Error: ${error2 instanceof Error ? error2.message : String(error2)}`,
        is_error: true
      };
    }
  }));
  return {
    role: "user",
    content: toolResults
  };
}

// node_modules/@anthropic-ai/sdk/internal/decoders/jsonl.mjs
class JSONLDecoder {
  constructor(iterator, controller) {
    this.iterator = iterator;
    this.controller = controller;
  }
  async* decoder() {
    const lineDecoder = new LineDecoder;
    for await (const chunk of this.iterator) {
      for (const line of lineDecoder.decode(chunk)) {
        yield JSON.parse(line);
      }
    }
    for (const line of lineDecoder.flush()) {
      yield JSON.parse(line);
    }
  }
  [Symbol.asyncIterator]() {
    return this.decoder();
  }
  static fromResponse(response, controller) {
    if (!response.body) {
      controller.abort();
      if (typeof globalThis.navigator !== "undefined" && globalThis.navigator.product === "ReactNative") {
        throw new AnthropicError(`The default react-native fetch implementation does not support streaming. Please use expo/fetch: https://docs.expo.dev/versions/latest/sdk/expo/#expofetch-api`);
      }
      throw new AnthropicError(`Attempted to iterate over a response with no body`);
    }
    return new JSONLDecoder(ReadableStreamToAsyncIterable(response.body), controller);
  }
}

// node_modules/@anthropic-ai/sdk/resources/beta/messages/batches.mjs
class Batches extends APIResource {
  create(params, options) {
    const { betas, ...body2 } = params;
    return this._client.post("/v1/messages/batches?beta=true", {
      body: body2,
      ...options,
      headers: buildHeaders([
        { "anthropic-beta": [...betas ?? [], "message-batches-2024-09-24"].toString() },
        options?.headers
      ])
    });
  }
  retrieve(messageBatchID, params = {}, options) {
    const { betas } = params ?? {};
    return this._client.get(path4`/v1/messages/batches/${messageBatchID}?beta=true`, {
      ...options,
      headers: buildHeaders([
        { "anthropic-beta": [...betas ?? [], "message-batches-2024-09-24"].toString() },
        options?.headers
      ])
    });
  }
  list(params = {}, options) {
    const { betas, ...query } = params ?? {};
    return this._client.getAPIList("/v1/messages/batches?beta=true", Page, {
      query,
      ...options,
      headers: buildHeaders([
        { "anthropic-beta": [...betas ?? [], "message-batches-2024-09-24"].toString() },
        options?.headers
      ])
    });
  }
  delete(messageBatchID, params = {}, options) {
    const { betas } = params ?? {};
    return this._client.delete(path4`/v1/messages/batches/${messageBatchID}?beta=true`, {
      ...options,
      headers: buildHeaders([
        { "anthropic-beta": [...betas ?? [], "message-batches-2024-09-24"].toString() },
        options?.headers
      ])
    });
  }
  cancel(messageBatchID, params = {}, options) {
    const { betas } = params ?? {};
    return this._client.post(path4`/v1/messages/batches/${messageBatchID}/cancel?beta=true`, {
      ...options,
      headers: buildHeaders([
        { "anthropic-beta": [...betas ?? [], "message-batches-2024-09-24"].toString() },
        options?.headers
      ])
    });
  }
  async results(messageBatchID, params = {}, options) {
    const batch = await this.retrieve(messageBatchID);
    if (!batch.results_url) {
      throw new AnthropicError(`No batch \`results_url\`; Has it finished processing? ${batch.processing_status} - ${batch.id}`);
    }
    const { betas } = params ?? {};
    return this._client.get(batch.results_url, {
      ...options,
      headers: buildHeaders([
        {
          "anthropic-beta": [...betas ?? [], "message-batches-2024-09-24"].toString(),
          Accept: "application/binary"
        },
        options?.headers
      ]),
      stream: true,
      __binaryResponse: true
    })._thenUnwrap((_, props) => JSONLDecoder.fromResponse(props.response, props.controller));
  }
}

// node_modules/@anthropic-ai/sdk/resources/beta/messages/messages.mjs
var DEPRECATED_MODELS = {
  "claude-1.3": "November 6th, 2024",
  "claude-1.3-100k": "November 6th, 2024",
  "claude-instant-1.1": "November 6th, 2024",
  "claude-instant-1.1-100k": "November 6th, 2024",
  "claude-instant-1.2": "November 6th, 2024",
  "claude-3-sonnet-20240229": "July 21st, 2025",
  "claude-3-opus-20240229": "January 5th, 2026",
  "claude-2.1": "July 21st, 2025",
  "claude-2.0": "July 21st, 2025",
  "claude-3-7-sonnet-latest": "February 19th, 2026",
  "claude-3-7-sonnet-20250219": "February 19th, 2026"
};

class Messages extends APIResource {
  constructor() {
    super(...arguments);
    this.batches = new Batches(this._client);
  }
  create(params, options) {
    const { betas, ...body2 } = params;
    if (body2.model in DEPRECATED_MODELS) {
      console.warn(`The model '${body2.model}' is deprecated and will reach end-of-life on ${DEPRECATED_MODELS[body2.model]}
Please migrate to a newer model. Visit https://docs.anthropic.com/en/docs/resources/model-deprecations for more information.`);
    }
    let timeout = this._client._options.timeout;
    if (!body2.stream && timeout == null) {
      const maxNonstreamingTokens = MODEL_NONSTREAMING_TOKENS[body2.model] ?? undefined;
      timeout = this._client.calculateNonstreamingTimeout(body2.max_tokens, maxNonstreamingTokens);
    }
    return this._client.post("/v1/messages?beta=true", {
      body: body2,
      timeout: timeout ?? 600000,
      ...options,
      headers: buildHeaders([
        { ...betas?.toString() != null ? { "anthropic-beta": betas?.toString() } : undefined },
        options?.headers
      ]),
      stream: params.stream ?? false
    });
  }
  parse(params, options) {
    options = {
      ...options,
      headers: buildHeaders([
        { "anthropic-beta": [...params.betas ?? [], "structured-outputs-2025-11-13"].toString() },
        options?.headers
      ])
    };
    return this.create(params, options).then((message) => parseBetaMessage(message, params, { logger: this._client.logger ?? console }));
  }
  stream(body2, options) {
    return BetaMessageStream.createMessage(this, body2, options);
  }
  countTokens(params, options) {
    const { betas, ...body2 } = params;
    return this._client.post("/v1/messages/count_tokens?beta=true", {
      body: body2,
      ...options,
      headers: buildHeaders([
        { "anthropic-beta": [...betas ?? [], "token-counting-2024-11-01"].toString() },
        options?.headers
      ])
    });
  }
  toolRunner(body2, options) {
    return new BetaToolRunner(this._client, body2, options);
  }
}
Messages.Batches = Batches;
Messages.BetaToolRunner = BetaToolRunner;

// node_modules/@anthropic-ai/sdk/resources/beta/skills/versions.mjs
class Versions extends APIResource {
  create(skillID, params = {}, options) {
    const { betas, ...body2 } = params ?? {};
    return this._client.post(path4`/v1/skills/${skillID}/versions?beta=true`, multipartFormRequestOptions({
      body: body2,
      ...options,
      headers: buildHeaders([
        { "anthropic-beta": [...betas ?? [], "skills-2025-10-02"].toString() },
        options?.headers
      ])
    }, this._client));
  }
  retrieve(version, params, options) {
    const { skill_id, betas } = params;
    return this._client.get(path4`/v1/skills/${skill_id}/versions/${version}?beta=true`, {
      ...options,
      headers: buildHeaders([
        { "anthropic-beta": [...betas ?? [], "skills-2025-10-02"].toString() },
        options?.headers
      ])
    });
  }
  list(skillID, params = {}, options) {
    const { betas, ...query } = params ?? {};
    return this._client.getAPIList(path4`/v1/skills/${skillID}/versions?beta=true`, PageCursor, {
      query,
      ...options,
      headers: buildHeaders([
        { "anthropic-beta": [...betas ?? [], "skills-2025-10-02"].toString() },
        options?.headers
      ])
    });
  }
  delete(version, params, options) {
    const { skill_id, betas } = params;
    return this._client.delete(path4`/v1/skills/${skill_id}/versions/${version}?beta=true`, {
      ...options,
      headers: buildHeaders([
        { "anthropic-beta": [...betas ?? [], "skills-2025-10-02"].toString() },
        options?.headers
      ])
    });
  }
}

// node_modules/@anthropic-ai/sdk/resources/beta/skills/skills.mjs
class Skills extends APIResource {
  constructor() {
    super(...arguments);
    this.versions = new Versions(this._client);
  }
  create(params = {}, options) {
    const { betas, ...body2 } = params ?? {};
    return this._client.post("/v1/skills?beta=true", multipartFormRequestOptions({
      body: body2,
      ...options,
      headers: buildHeaders([
        { "anthropic-beta": [...betas ?? [], "skills-2025-10-02"].toString() },
        options?.headers
      ])
    }, this._client));
  }
  retrieve(skillID, params = {}, options) {
    const { betas } = params ?? {};
    return this._client.get(path4`/v1/skills/${skillID}?beta=true`, {
      ...options,
      headers: buildHeaders([
        { "anthropic-beta": [...betas ?? [], "skills-2025-10-02"].toString() },
        options?.headers
      ])
    });
  }
  list(params = {}, options) {
    const { betas, ...query } = params ?? {};
    return this._client.getAPIList("/v1/skills?beta=true", PageCursor, {
      query,
      ...options,
      headers: buildHeaders([
        { "anthropic-beta": [...betas ?? [], "skills-2025-10-02"].toString() },
        options?.headers
      ])
    });
  }
  delete(skillID, params = {}, options) {
    const { betas } = params ?? {};
    return this._client.delete(path4`/v1/skills/${skillID}?beta=true`, {
      ...options,
      headers: buildHeaders([
        { "anthropic-beta": [...betas ?? [], "skills-2025-10-02"].toString() },
        options?.headers
      ])
    });
  }
}
Skills.Versions = Versions;

// node_modules/@anthropic-ai/sdk/resources/beta/beta.mjs
class Beta extends APIResource {
  constructor() {
    super(...arguments);
    this.models = new Models(this._client);
    this.messages = new Messages(this._client);
    this.files = new Files(this._client);
    this.skills = new Skills(this._client);
  }
}
Beta.Models = Models;
Beta.Messages = Messages;
Beta.Files = Files;
Beta.Skills = Skills;
// node_modules/@anthropic-ai/sdk/resources/completions.mjs
class Completions extends APIResource {
  create(params, options) {
    const { betas, ...body2 } = params;
    return this._client.post("/v1/complete", {
      body: body2,
      timeout: this._client._options.timeout ?? 600000,
      ...options,
      headers: buildHeaders([
        { ...betas?.toString() != null ? { "anthropic-beta": betas?.toString() } : undefined },
        options?.headers
      ]),
      stream: params.stream ?? false
    });
  }
}
// node_modules/@anthropic-ai/sdk/lib/MessageStream.mjs
var _MessageStream_instances;
var _MessageStream_currentMessageSnapshot;
var _MessageStream_connectedPromise;
var _MessageStream_resolveConnectedPromise;
var _MessageStream_rejectConnectedPromise;
var _MessageStream_endPromise;
var _MessageStream_resolveEndPromise;
var _MessageStream_rejectEndPromise;
var _MessageStream_listeners;
var _MessageStream_ended;
var _MessageStream_errored;
var _MessageStream_aborted;
var _MessageStream_catchingPromiseCreated;
var _MessageStream_response;
var _MessageStream_request_id;
var _MessageStream_getFinalMessage;
var _MessageStream_getFinalText;
var _MessageStream_handleError;
var _MessageStream_beginRequest;
var _MessageStream_addStreamEvent;
var _MessageStream_endRequest;
var _MessageStream_accumulateMessage;
var JSON_BUF_PROPERTY2 = "__json_buf";
function tracksToolInput2(content) {
  return content.type === "tool_use" || content.type === "server_tool_use";
}

class MessageStream {
  constructor() {
    _MessageStream_instances.add(this);
    this.messages = [];
    this.receivedMessages = [];
    _MessageStream_currentMessageSnapshot.set(this, undefined);
    this.controller = new AbortController;
    _MessageStream_connectedPromise.set(this, undefined);
    _MessageStream_resolveConnectedPromise.set(this, () => {});
    _MessageStream_rejectConnectedPromise.set(this, () => {});
    _MessageStream_endPromise.set(this, undefined);
    _MessageStream_resolveEndPromise.set(this, () => {});
    _MessageStream_rejectEndPromise.set(this, () => {});
    _MessageStream_listeners.set(this, {});
    _MessageStream_ended.set(this, false);
    _MessageStream_errored.set(this, false);
    _MessageStream_aborted.set(this, false);
    _MessageStream_catchingPromiseCreated.set(this, false);
    _MessageStream_response.set(this, undefined);
    _MessageStream_request_id.set(this, undefined);
    _MessageStream_handleError.set(this, (error2) => {
      __classPrivateFieldSet(this, _MessageStream_errored, true, "f");
      if (isAbortError(error2)) {
        error2 = new APIUserAbortError;
      }
      if (error2 instanceof APIUserAbortError) {
        __classPrivateFieldSet(this, _MessageStream_aborted, true, "f");
        return this._emit("abort", error2);
      }
      if (error2 instanceof AnthropicError) {
        return this._emit("error", error2);
      }
      if (error2 instanceof Error) {
        const anthropicError = new AnthropicError(error2.message);
        anthropicError.cause = error2;
        return this._emit("error", anthropicError);
      }
      return this._emit("error", new AnthropicError(String(error2)));
    });
    __classPrivateFieldSet(this, _MessageStream_connectedPromise, new Promise((resolve3, reject) => {
      __classPrivateFieldSet(this, _MessageStream_resolveConnectedPromise, resolve3, "f");
      __classPrivateFieldSet(this, _MessageStream_rejectConnectedPromise, reject, "f");
    }), "f");
    __classPrivateFieldSet(this, _MessageStream_endPromise, new Promise((resolve3, reject) => {
      __classPrivateFieldSet(this, _MessageStream_resolveEndPromise, resolve3, "f");
      __classPrivateFieldSet(this, _MessageStream_rejectEndPromise, reject, "f");
    }), "f");
    __classPrivateFieldGet(this, _MessageStream_connectedPromise, "f").catch(() => {});
    __classPrivateFieldGet(this, _MessageStream_endPromise, "f").catch(() => {});
  }
  get response() {
    return __classPrivateFieldGet(this, _MessageStream_response, "f");
  }
  get request_id() {
    return __classPrivateFieldGet(this, _MessageStream_request_id, "f");
  }
  async withResponse() {
    __classPrivateFieldSet(this, _MessageStream_catchingPromiseCreated, true, "f");
    const response = await __classPrivateFieldGet(this, _MessageStream_connectedPromise, "f");
    if (!response) {
      throw new Error("Could not resolve a `Response` object");
    }
    return {
      data: this,
      response,
      request_id: response.headers.get("request-id")
    };
  }
  static fromReadableStream(stream) {
    const runner = new MessageStream;
    runner._run(() => runner._fromReadableStream(stream));
    return runner;
  }
  static createMessage(messages, params, options) {
    const runner = new MessageStream;
    for (const message of params.messages) {
      runner._addMessageParam(message);
    }
    runner._run(() => runner._createMessage(messages, { ...params, stream: true }, { ...options, headers: { ...options?.headers, "X-Stainless-Helper-Method": "stream" } }));
    return runner;
  }
  _run(executor) {
    executor().then(() => {
      this._emitFinal();
      this._emit("end");
    }, __classPrivateFieldGet(this, _MessageStream_handleError, "f"));
  }
  _addMessageParam(message) {
    this.messages.push(message);
  }
  _addMessage(message, emit = true) {
    this.receivedMessages.push(message);
    if (emit) {
      this._emit("message", message);
    }
  }
  async _createMessage(messages, params, options) {
    const signal = options?.signal;
    let abortHandler;
    if (signal) {
      if (signal.aborted)
        this.controller.abort();
      abortHandler = this.controller.abort.bind(this.controller);
      signal.addEventListener("abort", abortHandler);
    }
    try {
      __classPrivateFieldGet(this, _MessageStream_instances, "m", _MessageStream_beginRequest).call(this);
      const { response, data: stream } = await messages.create({ ...params, stream: true }, { ...options, signal: this.controller.signal }).withResponse();
      this._connected(response);
      for await (const event of stream) {
        __classPrivateFieldGet(this, _MessageStream_instances, "m", _MessageStream_addStreamEvent).call(this, event);
      }
      if (stream.controller.signal?.aborted) {
        throw new APIUserAbortError;
      }
      __classPrivateFieldGet(this, _MessageStream_instances, "m", _MessageStream_endRequest).call(this);
    } finally {
      if (signal && abortHandler) {
        signal.removeEventListener("abort", abortHandler);
      }
    }
  }
  _connected(response) {
    if (this.ended)
      return;
    __classPrivateFieldSet(this, _MessageStream_response, response, "f");
    __classPrivateFieldSet(this, _MessageStream_request_id, response?.headers.get("request-id"), "f");
    __classPrivateFieldGet(this, _MessageStream_resolveConnectedPromise, "f").call(this, response);
    this._emit("connect");
  }
  get ended() {
    return __classPrivateFieldGet(this, _MessageStream_ended, "f");
  }
  get errored() {
    return __classPrivateFieldGet(this, _MessageStream_errored, "f");
  }
  get aborted() {
    return __classPrivateFieldGet(this, _MessageStream_aborted, "f");
  }
  abort() {
    this.controller.abort();
  }
  on(event, listener) {
    const listeners = __classPrivateFieldGet(this, _MessageStream_listeners, "f")[event] || (__classPrivateFieldGet(this, _MessageStream_listeners, "f")[event] = []);
    listeners.push({ listener });
    return this;
  }
  off(event, listener) {
    const listeners = __classPrivateFieldGet(this, _MessageStream_listeners, "f")[event];
    if (!listeners)
      return this;
    const index = listeners.findIndex((l) => l.listener === listener);
    if (index >= 0)
      listeners.splice(index, 1);
    return this;
  }
  once(event, listener) {
    const listeners = __classPrivateFieldGet(this, _MessageStream_listeners, "f")[event] || (__classPrivateFieldGet(this, _MessageStream_listeners, "f")[event] = []);
    listeners.push({ listener, once: true });
    return this;
  }
  emitted(event) {
    return new Promise((resolve3, reject) => {
      __classPrivateFieldSet(this, _MessageStream_catchingPromiseCreated, true, "f");
      if (event !== "error")
        this.once("error", reject);
      this.once(event, resolve3);
    });
  }
  async done() {
    __classPrivateFieldSet(this, _MessageStream_catchingPromiseCreated, true, "f");
    await __classPrivateFieldGet(this, _MessageStream_endPromise, "f");
  }
  get currentMessage() {
    return __classPrivateFieldGet(this, _MessageStream_currentMessageSnapshot, "f");
  }
  async finalMessage() {
    await this.done();
    return __classPrivateFieldGet(this, _MessageStream_instances, "m", _MessageStream_getFinalMessage).call(this);
  }
  async finalText() {
    await this.done();
    return __classPrivateFieldGet(this, _MessageStream_instances, "m", _MessageStream_getFinalText).call(this);
  }
  _emit(event, ...args2) {
    if (__classPrivateFieldGet(this, _MessageStream_ended, "f"))
      return;
    if (event === "end") {
      __classPrivateFieldSet(this, _MessageStream_ended, true, "f");
      __classPrivateFieldGet(this, _MessageStream_resolveEndPromise, "f").call(this);
    }
    const listeners = __classPrivateFieldGet(this, _MessageStream_listeners, "f")[event];
    if (listeners) {
      __classPrivateFieldGet(this, _MessageStream_listeners, "f")[event] = listeners.filter((l) => !l.once);
      listeners.forEach(({ listener }) => listener(...args2));
    }
    if (event === "abort") {
      const error2 = args2[0];
      if (!__classPrivateFieldGet(this, _MessageStream_catchingPromiseCreated, "f") && !listeners?.length) {
        Promise.reject(error2);
      }
      __classPrivateFieldGet(this, _MessageStream_rejectConnectedPromise, "f").call(this, error2);
      __classPrivateFieldGet(this, _MessageStream_rejectEndPromise, "f").call(this, error2);
      this._emit("end");
      return;
    }
    if (event === "error") {
      const error2 = args2[0];
      if (!__classPrivateFieldGet(this, _MessageStream_catchingPromiseCreated, "f") && !listeners?.length) {
        Promise.reject(error2);
      }
      __classPrivateFieldGet(this, _MessageStream_rejectConnectedPromise, "f").call(this, error2);
      __classPrivateFieldGet(this, _MessageStream_rejectEndPromise, "f").call(this, error2);
      this._emit("end");
    }
  }
  _emitFinal() {
    const finalMessage = this.receivedMessages.at(-1);
    if (finalMessage) {
      this._emit("finalMessage", __classPrivateFieldGet(this, _MessageStream_instances, "m", _MessageStream_getFinalMessage).call(this));
    }
  }
  async _fromReadableStream(readableStream, options) {
    const signal = options?.signal;
    let abortHandler;
    if (signal) {
      if (signal.aborted)
        this.controller.abort();
      abortHandler = this.controller.abort.bind(this.controller);
      signal.addEventListener("abort", abortHandler);
    }
    try {
      __classPrivateFieldGet(this, _MessageStream_instances, "m", _MessageStream_beginRequest).call(this);
      this._connected(null);
      const stream = Stream.fromReadableStream(readableStream, this.controller);
      for await (const event of stream) {
        __classPrivateFieldGet(this, _MessageStream_instances, "m", _MessageStream_addStreamEvent).call(this, event);
      }
      if (stream.controller.signal?.aborted) {
        throw new APIUserAbortError;
      }
      __classPrivateFieldGet(this, _MessageStream_instances, "m", _MessageStream_endRequest).call(this);
    } finally {
      if (signal && abortHandler) {
        signal.removeEventListener("abort", abortHandler);
      }
    }
  }
  [(_MessageStream_currentMessageSnapshot = new WeakMap, _MessageStream_connectedPromise = new WeakMap, _MessageStream_resolveConnectedPromise = new WeakMap, _MessageStream_rejectConnectedPromise = new WeakMap, _MessageStream_endPromise = new WeakMap, _MessageStream_resolveEndPromise = new WeakMap, _MessageStream_rejectEndPromise = new WeakMap, _MessageStream_listeners = new WeakMap, _MessageStream_ended = new WeakMap, _MessageStream_errored = new WeakMap, _MessageStream_aborted = new WeakMap, _MessageStream_catchingPromiseCreated = new WeakMap, _MessageStream_response = new WeakMap, _MessageStream_request_id = new WeakMap, _MessageStream_handleError = new WeakMap, _MessageStream_instances = new WeakSet, _MessageStream_getFinalMessage = function _MessageStream_getFinalMessage() {
    if (this.receivedMessages.length === 0) {
      throw new AnthropicError("stream ended without producing a Message with role=assistant");
    }
    return this.receivedMessages.at(-1);
  }, _MessageStream_getFinalText = function _MessageStream_getFinalText() {
    if (this.receivedMessages.length === 0) {
      throw new AnthropicError("stream ended without producing a Message with role=assistant");
    }
    const textBlocks = this.receivedMessages.at(-1).content.filter((block) => block.type === "text").map((block) => block.text);
    if (textBlocks.length === 0) {
      throw new AnthropicError("stream ended without producing a content block with type=text");
    }
    return textBlocks.join(" ");
  }, _MessageStream_beginRequest = function _MessageStream_beginRequest() {
    if (this.ended)
      return;
    __classPrivateFieldSet(this, _MessageStream_currentMessageSnapshot, undefined, "f");
  }, _MessageStream_addStreamEvent = function _MessageStream_addStreamEvent(event) {
    if (this.ended)
      return;
    const messageSnapshot = __classPrivateFieldGet(this, _MessageStream_instances, "m", _MessageStream_accumulateMessage).call(this, event);
    this._emit("streamEvent", event, messageSnapshot);
    switch (event.type) {
      case "content_block_delta": {
        const content = messageSnapshot.content.at(-1);
        switch (event.delta.type) {
          case "text_delta": {
            if (content.type === "text") {
              this._emit("text", event.delta.text, content.text || "");
            }
            break;
          }
          case "citations_delta": {
            if (content.type === "text") {
              this._emit("citation", event.delta.citation, content.citations ?? []);
            }
            break;
          }
          case "input_json_delta": {
            if (tracksToolInput2(content) && content.input) {
              this._emit("inputJson", event.delta.partial_json, content.input);
            }
            break;
          }
          case "thinking_delta": {
            if (content.type === "thinking") {
              this._emit("thinking", event.delta.thinking, content.thinking);
            }
            break;
          }
          case "signature_delta": {
            if (content.type === "thinking") {
              this._emit("signature", content.signature);
            }
            break;
          }
          default:
            checkNever2(event.delta);
        }
        break;
      }
      case "message_stop": {
        this._addMessageParam(messageSnapshot);
        this._addMessage(messageSnapshot, true);
        break;
      }
      case "content_block_stop": {
        this._emit("contentBlock", messageSnapshot.content.at(-1));
        break;
      }
      case "message_start": {
        __classPrivateFieldSet(this, _MessageStream_currentMessageSnapshot, messageSnapshot, "f");
        break;
      }
      case "content_block_start":
      case "message_delta":
        break;
    }
  }, _MessageStream_endRequest = function _MessageStream_endRequest() {
    if (this.ended) {
      throw new AnthropicError(`stream has ended, this shouldn't happen`);
    }
    const snapshot = __classPrivateFieldGet(this, _MessageStream_currentMessageSnapshot, "f");
    if (!snapshot) {
      throw new AnthropicError(`request ended without sending any chunks`);
    }
    __classPrivateFieldSet(this, _MessageStream_currentMessageSnapshot, undefined, "f");
    return snapshot;
  }, _MessageStream_accumulateMessage = function _MessageStream_accumulateMessage(event) {
    let snapshot = __classPrivateFieldGet(this, _MessageStream_currentMessageSnapshot, "f");
    if (event.type === "message_start") {
      if (snapshot) {
        throw new AnthropicError(`Unexpected event order, got ${event.type} before receiving "message_stop"`);
      }
      return event.message;
    }
    if (!snapshot) {
      throw new AnthropicError(`Unexpected event order, got ${event.type} before "message_start"`);
    }
    switch (event.type) {
      case "message_stop":
        return snapshot;
      case "message_delta":
        snapshot.stop_reason = event.delta.stop_reason;
        snapshot.stop_sequence = event.delta.stop_sequence;
        snapshot.usage.output_tokens = event.usage.output_tokens;
        if (event.usage.input_tokens != null) {
          snapshot.usage.input_tokens = event.usage.input_tokens;
        }
        if (event.usage.cache_creation_input_tokens != null) {
          snapshot.usage.cache_creation_input_tokens = event.usage.cache_creation_input_tokens;
        }
        if (event.usage.cache_read_input_tokens != null) {
          snapshot.usage.cache_read_input_tokens = event.usage.cache_read_input_tokens;
        }
        if (event.usage.server_tool_use != null) {
          snapshot.usage.server_tool_use = event.usage.server_tool_use;
        }
        return snapshot;
      case "content_block_start":
        snapshot.content.push({ ...event.content_block });
        return snapshot;
      case "content_block_delta": {
        const snapshotContent = snapshot.content.at(event.index);
        switch (event.delta.type) {
          case "text_delta": {
            if (snapshotContent?.type === "text") {
              snapshot.content[event.index] = {
                ...snapshotContent,
                text: (snapshotContent.text || "") + event.delta.text
              };
            }
            break;
          }
          case "citations_delta": {
            if (snapshotContent?.type === "text") {
              snapshot.content[event.index] = {
                ...snapshotContent,
                citations: [...snapshotContent.citations ?? [], event.delta.citation]
              };
            }
            break;
          }
          case "input_json_delta": {
            if (snapshotContent && tracksToolInput2(snapshotContent)) {
              let jsonBuf = snapshotContent[JSON_BUF_PROPERTY2] || "";
              jsonBuf += event.delta.partial_json;
              const newContent = { ...snapshotContent };
              Object.defineProperty(newContent, JSON_BUF_PROPERTY2, {
                value: jsonBuf,
                enumerable: false,
                writable: true
              });
              if (jsonBuf) {
                newContent.input = partialParse(jsonBuf);
              }
              snapshot.content[event.index] = newContent;
            }
            break;
          }
          case "thinking_delta": {
            if (snapshotContent?.type === "thinking") {
              snapshot.content[event.index] = {
                ...snapshotContent,
                thinking: snapshotContent.thinking + event.delta.thinking
              };
            }
            break;
          }
          case "signature_delta": {
            if (snapshotContent?.type === "thinking") {
              snapshot.content[event.index] = {
                ...snapshotContent,
                signature: event.delta.signature
              };
            }
            break;
          }
          default:
            checkNever2(event.delta);
        }
        return snapshot;
      }
      case "content_block_stop":
        return snapshot;
    }
  }, Symbol.asyncIterator)]() {
    const pushQueue = [];
    const readQueue = [];
    let done = false;
    this.on("streamEvent", (event) => {
      const reader = readQueue.shift();
      if (reader) {
        reader.resolve(event);
      } else {
        pushQueue.push(event);
      }
    });
    this.on("end", () => {
      done = true;
      for (const reader of readQueue) {
        reader.resolve(undefined);
      }
      readQueue.length = 0;
    });
    this.on("abort", (err2) => {
      done = true;
      for (const reader of readQueue) {
        reader.reject(err2);
      }
      readQueue.length = 0;
    });
    this.on("error", (err2) => {
      done = true;
      for (const reader of readQueue) {
        reader.reject(err2);
      }
      readQueue.length = 0;
    });
    return {
      next: async () => {
        if (!pushQueue.length) {
          if (done) {
            return { value: undefined, done: true };
          }
          return new Promise((resolve3, reject) => readQueue.push({ resolve: resolve3, reject })).then((chunk2) => chunk2 ? { value: chunk2, done: false } : { value: undefined, done: true });
        }
        const chunk = pushQueue.shift();
        return { value: chunk, done: false };
      },
      return: async () => {
        this.abort();
        return { value: undefined, done: true };
      }
    };
  }
  toReadableStream() {
    const stream = new Stream(this[Symbol.asyncIterator].bind(this), this.controller);
    return stream.toReadableStream();
  }
}
function checkNever2(x) {}

// node_modules/@anthropic-ai/sdk/resources/messages/batches.mjs
class Batches2 extends APIResource {
  create(body2, options) {
    return this._client.post("/v1/messages/batches", { body: body2, ...options });
  }
  retrieve(messageBatchID, options) {
    return this._client.get(path4`/v1/messages/batches/${messageBatchID}`, options);
  }
  list(query = {}, options) {
    return this._client.getAPIList("/v1/messages/batches", Page, { query, ...options });
  }
  delete(messageBatchID, options) {
    return this._client.delete(path4`/v1/messages/batches/${messageBatchID}`, options);
  }
  cancel(messageBatchID, options) {
    return this._client.post(path4`/v1/messages/batches/${messageBatchID}/cancel`, options);
  }
  async results(messageBatchID, options) {
    const batch = await this.retrieve(messageBatchID);
    if (!batch.results_url) {
      throw new AnthropicError(`No batch \`results_url\`; Has it finished processing? ${batch.processing_status} - ${batch.id}`);
    }
    return this._client.get(batch.results_url, {
      ...options,
      headers: buildHeaders([{ Accept: "application/binary" }, options?.headers]),
      stream: true,
      __binaryResponse: true
    })._thenUnwrap((_, props) => JSONLDecoder.fromResponse(props.response, props.controller));
  }
}

// node_modules/@anthropic-ai/sdk/resources/messages/messages.mjs
class Messages2 extends APIResource {
  constructor() {
    super(...arguments);
    this.batches = new Batches2(this._client);
  }
  create(body2, options) {
    if (body2.model in DEPRECATED_MODELS2) {
      console.warn(`The model '${body2.model}' is deprecated and will reach end-of-life on ${DEPRECATED_MODELS2[body2.model]}
Please migrate to a newer model. Visit https://docs.anthropic.com/en/docs/resources/model-deprecations for more information.`);
    }
    let timeout = this._client._options.timeout;
    if (!body2.stream && timeout == null) {
      const maxNonstreamingTokens = MODEL_NONSTREAMING_TOKENS[body2.model] ?? undefined;
      timeout = this._client.calculateNonstreamingTimeout(body2.max_tokens, maxNonstreamingTokens);
    }
    return this._client.post("/v1/messages", {
      body: body2,
      timeout: timeout ?? 600000,
      ...options,
      stream: body2.stream ?? false
    });
  }
  stream(body2, options) {
    return MessageStream.createMessage(this, body2, options);
  }
  countTokens(body2, options) {
    return this._client.post("/v1/messages/count_tokens", { body: body2, ...options });
  }
}
var DEPRECATED_MODELS2 = {
  "claude-1.3": "November 6th, 2024",
  "claude-1.3-100k": "November 6th, 2024",
  "claude-instant-1.1": "November 6th, 2024",
  "claude-instant-1.1-100k": "November 6th, 2024",
  "claude-instant-1.2": "November 6th, 2024",
  "claude-3-sonnet-20240229": "July 21st, 2025",
  "claude-3-opus-20240229": "January 5th, 2026",
  "claude-2.1": "July 21st, 2025",
  "claude-2.0": "July 21st, 2025",
  "claude-3-7-sonnet-latest": "February 19th, 2026",
  "claude-3-7-sonnet-20250219": "February 19th, 2026"
};
Messages2.Batches = Batches2;
// node_modules/@anthropic-ai/sdk/resources/models.mjs
class Models2 extends APIResource {
  retrieve(modelID, params = {}, options) {
    const { betas } = params ?? {};
    return this._client.get(path4`/v1/models/${modelID}`, {
      ...options,
      headers: buildHeaders([
        { ...betas?.toString() != null ? { "anthropic-beta": betas?.toString() } : undefined },
        options?.headers
      ])
    });
  }
  list(params = {}, options) {
    const { betas, ...query } = params ?? {};
    return this._client.getAPIList("/v1/models", Page, {
      query,
      ...options,
      headers: buildHeaders([
        { ...betas?.toString() != null ? { "anthropic-beta": betas?.toString() } : undefined },
        options?.headers
      ])
    });
  }
}
// node_modules/@anthropic-ai/sdk/internal/utils/env.mjs
var readEnv = (env) => {
  if (typeof globalThis.process !== "undefined") {
    return globalThis.process.env?.[env]?.trim() ?? undefined;
  }
  if (typeof globalThis.Deno !== "undefined") {
    return globalThis.Deno.env?.get?.(env)?.trim();
  }
  return;
};

// node_modules/@anthropic-ai/sdk/client.mjs
var _BaseAnthropic_instances;
var _a;
var _BaseAnthropic_encoder;
var _BaseAnthropic_baseURLOverridden;
var HUMAN_PROMPT = "\\n\\nHuman:";
var AI_PROMPT = "\\n\\nAssistant:";

class BaseAnthropic {
  constructor({ baseURL = readEnv("ANTHROPIC_BASE_URL"), apiKey = readEnv("ANTHROPIC_API_KEY") ?? null, authToken = readEnv("ANTHROPIC_AUTH_TOKEN") ?? null, ...opts } = {}) {
    _BaseAnthropic_instances.add(this);
    _BaseAnthropic_encoder.set(this, undefined);
    const options = {
      apiKey,
      authToken,
      ...opts,
      baseURL: baseURL || `https://api.anthropic.com`
    };
    if (!options.dangerouslyAllowBrowser && isRunningInBrowser()) {
      throw new AnthropicError(`It looks like you're running in a browser-like environment.

This is disabled by default, as it risks exposing your secret API credentials to attackers.
If you understand the risks and have appropriate mitigations in place,
you can set the \`dangerouslyAllowBrowser\` option to \`true\`, e.g.,

new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
`);
    }
    this.baseURL = options.baseURL;
    this.timeout = options.timeout ?? _a.DEFAULT_TIMEOUT;
    this.logger = options.logger ?? console;
    const defaultLogLevel = "warn";
    this.logLevel = defaultLogLevel;
    this.logLevel = parseLogLevel(options.logLevel, "ClientOptions.logLevel", this) ?? parseLogLevel(readEnv("ANTHROPIC_LOG"), "process.env['ANTHROPIC_LOG']", this) ?? defaultLogLevel;
    this.fetchOptions = options.fetchOptions;
    this.maxRetries = options.maxRetries ?? 2;
    this.fetch = options.fetch ?? getDefaultFetch();
    __classPrivateFieldSet(this, _BaseAnthropic_encoder, FallbackEncoder, "f");
    this._options = options;
    this.apiKey = typeof apiKey === "string" ? apiKey : null;
    this.authToken = authToken;
  }
  withOptions(options) {
    const client = new this.constructor({
      ...this._options,
      baseURL: this.baseURL,
      maxRetries: this.maxRetries,
      timeout: this.timeout,
      logger: this.logger,
      logLevel: this.logLevel,
      fetch: this.fetch,
      fetchOptions: this.fetchOptions,
      apiKey: this.apiKey,
      authToken: this.authToken,
      ...options
    });
    return client;
  }
  defaultQuery() {
    return this._options.defaultQuery;
  }
  validateHeaders({ values, nulls }) {
    if (values.get("x-api-key") || values.get("authorization")) {
      return;
    }
    if (this.apiKey && values.get("x-api-key")) {
      return;
    }
    if (nulls.has("x-api-key")) {
      return;
    }
    if (this.authToken && values.get("authorization")) {
      return;
    }
    if (nulls.has("authorization")) {
      return;
    }
    throw new Error('Could not resolve authentication method. Expected either apiKey or authToken to be set. Or for one of the "X-Api-Key" or "Authorization" headers to be explicitly omitted');
  }
  async authHeaders(opts) {
    return buildHeaders([await this.apiKeyAuth(opts), await this.bearerAuth(opts)]);
  }
  async apiKeyAuth(opts) {
    if (this.apiKey == null) {
      return;
    }
    return buildHeaders([{ "X-Api-Key": this.apiKey }]);
  }
  async bearerAuth(opts) {
    if (this.authToken == null) {
      return;
    }
    return buildHeaders([{ Authorization: `Bearer ${this.authToken}` }]);
  }
  stringifyQuery(query) {
    return Object.entries(query).filter(([_, value]) => typeof value !== "undefined").map(([key, value]) => {
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
      }
      if (value === null) {
        return `${encodeURIComponent(key)}=`;
      }
      throw new AnthropicError(`Cannot stringify type ${typeof value}; Expected string, number, boolean, or null. If you need to pass nested query parameters, you can manually encode them, e.g. { query: { 'foo[key1]': value1, 'foo[key2]': value2 } }, and please open a GitHub issue requesting better support for your use case.`);
    }).join("&");
  }
  getUserAgent() {
    return `${this.constructor.name}/JS ${VERSION}`;
  }
  defaultIdempotencyKey() {
    return `stainless-node-retry-${uuid4()}`;
  }
  makeStatusError(status, error2, message, headers) {
    return APIError.generate(status, error2, message, headers);
  }
  buildURL(path5, query, defaultBaseURL) {
    const baseURL = !__classPrivateFieldGet(this, _BaseAnthropic_instances, "m", _BaseAnthropic_baseURLOverridden).call(this) && defaultBaseURL || this.baseURL;
    const url = isAbsoluteURL(path5) ? new URL(path5) : new URL(baseURL + (baseURL.endsWith("/") && path5.startsWith("/") ? path5.slice(1) : path5));
    const defaultQuery = this.defaultQuery();
    if (!isEmptyObj(defaultQuery)) {
      query = { ...defaultQuery, ...query };
    }
    if (typeof query === "object" && query && !Array.isArray(query)) {
      url.search = this.stringifyQuery(query);
    }
    return url.toString();
  }
  _calculateNonstreamingTimeout(maxTokens) {
    const defaultTimeout = 10 * 60;
    const expectedTimeout = 60 * 60 * maxTokens / 128000;
    if (expectedTimeout > defaultTimeout) {
      throw new AnthropicError("Streaming is required for operations that may take longer than 10 minutes. " + "See https://github.com/anthropics/anthropic-sdk-typescript#streaming-responses for more details");
    }
    return defaultTimeout * 1000;
  }
  async prepareOptions(options) {}
  async prepareRequest(request, { url, options }) {}
  get(path5, opts) {
    return this.methodRequest("get", path5, opts);
  }
  post(path5, opts) {
    return this.methodRequest("post", path5, opts);
  }
  patch(path5, opts) {
    return this.methodRequest("patch", path5, opts);
  }
  put(path5, opts) {
    return this.methodRequest("put", path5, opts);
  }
  delete(path5, opts) {
    return this.methodRequest("delete", path5, opts);
  }
  methodRequest(method, path5, opts) {
    return this.request(Promise.resolve(opts).then((opts2) => {
      return { method, path: path5, ...opts2 };
    }));
  }
  request(options, remainingRetries = null) {
    return new APIPromise(this, this.makeRequest(options, remainingRetries, undefined));
  }
  async makeRequest(optionsInput, retriesRemaining, retryOfRequestLogID) {
    const options = await optionsInput;
    const maxRetries = options.maxRetries ?? this.maxRetries;
    if (retriesRemaining == null) {
      retriesRemaining = maxRetries;
    }
    await this.prepareOptions(options);
    const { req, url, timeout } = await this.buildRequest(options, {
      retryCount: maxRetries - retriesRemaining
    });
    await this.prepareRequest(req, { url, options });
    const requestLogID = "log_" + (Math.random() * (1 << 24) | 0).toString(16).padStart(6, "0");
    const retryLogStr = retryOfRequestLogID === undefined ? "" : `, retryOf: ${retryOfRequestLogID}`;
    const startTime = Date.now();
    loggerFor(this).debug(`[${requestLogID}] sending request`, formatRequestDetails({
      retryOfRequestLogID,
      method: options.method,
      url,
      options,
      headers: req.headers
    }));
    if (options.signal?.aborted) {
      throw new APIUserAbortError;
    }
    const controller = new AbortController;
    const response = await this.fetchWithTimeout(url, req, timeout, controller).catch(castToError);
    const headersTime = Date.now();
    if (response instanceof globalThis.Error) {
      const retryMessage = `retrying, ${retriesRemaining} attempts remaining`;
      if (options.signal?.aborted) {
        throw new APIUserAbortError;
      }
      const isTimeout = isAbortError(response) || /timed? ?out/i.test(String(response) + ("cause" in response ? String(response.cause) : ""));
      if (retriesRemaining) {
        loggerFor(this).info(`[${requestLogID}] connection ${isTimeout ? "timed out" : "failed"} - ${retryMessage}`);
        loggerFor(this).debug(`[${requestLogID}] connection ${isTimeout ? "timed out" : "failed"} (${retryMessage})`, formatRequestDetails({
          retryOfRequestLogID,
          url,
          durationMs: headersTime - startTime,
          message: response.message
        }));
        return this.retryRequest(options, retriesRemaining, retryOfRequestLogID ?? requestLogID);
      }
      loggerFor(this).info(`[${requestLogID}] connection ${isTimeout ? "timed out" : "failed"} - error; no more retries left`);
      loggerFor(this).debug(`[${requestLogID}] connection ${isTimeout ? "timed out" : "failed"} (error; no more retries left)`, formatRequestDetails({
        retryOfRequestLogID,
        url,
        durationMs: headersTime - startTime,
        message: response.message
      }));
      if (isTimeout) {
        throw new APIConnectionTimeoutError;
      }
      throw new APIConnectionError({ cause: response });
    }
    const specialHeaders = [...response.headers.entries()].filter(([name2]) => name2 === "request-id").map(([name2, value]) => ", " + name2 + ": " + JSON.stringify(value)).join("");
    const responseInfo = `[${requestLogID}${retryLogStr}${specialHeaders}] ${req.method} ${url} ${response.ok ? "succeeded" : "failed"} with status ${response.status} in ${headersTime - startTime}ms`;
    if (!response.ok) {
      const shouldRetry = await this.shouldRetry(response);
      if (retriesRemaining && shouldRetry) {
        const retryMessage2 = `retrying, ${retriesRemaining} attempts remaining`;
        await CancelReadableStream(response.body);
        loggerFor(this).info(`${responseInfo} - ${retryMessage2}`);
        loggerFor(this).debug(`[${requestLogID}] response error (${retryMessage2})`, formatRequestDetails({
          retryOfRequestLogID,
          url: response.url,
          status: response.status,
          headers: response.headers,
          durationMs: headersTime - startTime
        }));
        return this.retryRequest(options, retriesRemaining, retryOfRequestLogID ?? requestLogID, response.headers);
      }
      const retryMessage = shouldRetry ? `error; no more retries left` : `error; not retryable`;
      loggerFor(this).info(`${responseInfo} - ${retryMessage}`);
      const errText = await response.text().catch((err3) => castToError(err3).message);
      const errJSON = safeJSON(errText);
      const errMessage = errJSON ? undefined : errText;
      loggerFor(this).debug(`[${requestLogID}] response error (${retryMessage})`, formatRequestDetails({
        retryOfRequestLogID,
        url: response.url,
        status: response.status,
        headers: response.headers,
        message: errMessage,
        durationMs: Date.now() - startTime
      }));
      const err2 = this.makeStatusError(response.status, errJSON, errMessage, response.headers);
      throw err2;
    }
    loggerFor(this).info(responseInfo);
    loggerFor(this).debug(`[${requestLogID}] response start`, formatRequestDetails({
      retryOfRequestLogID,
      url: response.url,
      status: response.status,
      headers: response.headers,
      durationMs: headersTime - startTime
    }));
    return { response, options, controller, requestLogID, retryOfRequestLogID, startTime };
  }
  getAPIList(path5, Page2, opts) {
    return this.requestAPIList(Page2, { method: "get", path: path5, ...opts });
  }
  requestAPIList(Page2, options) {
    const request = this.makeRequest(options, null, undefined);
    return new PagePromise(this, request, Page2);
  }
  async fetchWithTimeout(url, init3, ms, controller) {
    const { signal, method, ...options } = init3 || {};
    if (signal)
      signal.addEventListener("abort", () => controller.abort());
    const timeout = setTimeout(() => controller.abort(), ms);
    const isReadableBody = globalThis.ReadableStream && options.body instanceof globalThis.ReadableStream || typeof options.body === "object" && options.body !== null && Symbol.asyncIterator in options.body;
    const fetchOptions = {
      signal: controller.signal,
      ...isReadableBody ? { duplex: "half" } : {},
      method: "GET",
      ...options
    };
    if (method) {
      fetchOptions.method = method.toUpperCase();
    }
    try {
      return await this.fetch.call(undefined, url, fetchOptions);
    } finally {
      clearTimeout(timeout);
    }
  }
  async shouldRetry(response) {
    const shouldRetryHeader = response.headers.get("x-should-retry");
    if (shouldRetryHeader === "true")
      return true;
    if (shouldRetryHeader === "false")
      return false;
    if (response.status === 408)
      return true;
    if (response.status === 409)
      return true;
    if (response.status === 429)
      return true;
    if (response.status >= 500)
      return true;
    return false;
  }
  async retryRequest(options, retriesRemaining, requestLogID, responseHeaders) {
    let timeoutMillis;
    const retryAfterMillisHeader = responseHeaders?.get("retry-after-ms");
    if (retryAfterMillisHeader) {
      const timeoutMs = parseFloat(retryAfterMillisHeader);
      if (!Number.isNaN(timeoutMs)) {
        timeoutMillis = timeoutMs;
      }
    }
    const retryAfterHeader = responseHeaders?.get("retry-after");
    if (retryAfterHeader && !timeoutMillis) {
      const timeoutSeconds = parseFloat(retryAfterHeader);
      if (!Number.isNaN(timeoutSeconds)) {
        timeoutMillis = timeoutSeconds * 1000;
      } else {
        timeoutMillis = Date.parse(retryAfterHeader) - Date.now();
      }
    }
    if (!(timeoutMillis && 0 <= timeoutMillis && timeoutMillis < 60 * 1000)) {
      const maxRetries = options.maxRetries ?? this.maxRetries;
      timeoutMillis = this.calculateDefaultRetryTimeoutMillis(retriesRemaining, maxRetries);
    }
    await sleep(timeoutMillis);
    return this.makeRequest(options, retriesRemaining - 1, requestLogID);
  }
  calculateDefaultRetryTimeoutMillis(retriesRemaining, maxRetries) {
    const initialRetryDelay = 0.5;
    const maxRetryDelay = 8;
    const numRetries = maxRetries - retriesRemaining;
    const sleepSeconds = Math.min(initialRetryDelay * Math.pow(2, numRetries), maxRetryDelay);
    const jitter = 1 - Math.random() * 0.25;
    return sleepSeconds * jitter * 1000;
  }
  calculateNonstreamingTimeout(maxTokens, maxNonstreamingTokens) {
    const maxTime = 60 * 60 * 1000;
    const defaultTime = 60 * 10 * 1000;
    const expectedTime = maxTime * maxTokens / 128000;
    if (expectedTime > defaultTime || maxNonstreamingTokens != null && maxTokens > maxNonstreamingTokens) {
      throw new AnthropicError("Streaming is required for operations that may take longer than 10 minutes. See https://github.com/anthropics/anthropic-sdk-typescript#long-requests for more details");
    }
    return defaultTime;
  }
  async buildRequest(inputOptions, { retryCount = 0 } = {}) {
    const options = { ...inputOptions };
    const { method, path: path5, query, defaultBaseURL } = options;
    const url = this.buildURL(path5, query, defaultBaseURL);
    if ("timeout" in options)
      validatePositiveInteger("timeout", options.timeout);
    options.timeout = options.timeout ?? this.timeout;
    const { bodyHeaders, body: body2 } = this.buildBody({ options });
    const reqHeaders = await this.buildHeaders({ options: inputOptions, method, bodyHeaders, retryCount });
    const req = {
      method,
      headers: reqHeaders,
      ...options.signal && { signal: options.signal },
      ...globalThis.ReadableStream && body2 instanceof globalThis.ReadableStream && { duplex: "half" },
      ...body2 && { body: body2 },
      ...this.fetchOptions ?? {},
      ...options.fetchOptions ?? {}
    };
    return { req, url, timeout: options.timeout };
  }
  async buildHeaders({ options, method, bodyHeaders, retryCount }) {
    let idempotencyHeaders = {};
    if (this.idempotencyHeader && method !== "get") {
      if (!options.idempotencyKey)
        options.idempotencyKey = this.defaultIdempotencyKey();
      idempotencyHeaders[this.idempotencyHeader] = options.idempotencyKey;
    }
    const headers = buildHeaders([
      idempotencyHeaders,
      {
        Accept: "application/json",
        "User-Agent": this.getUserAgent(),
        "X-Stainless-Retry-Count": String(retryCount),
        ...options.timeout ? { "X-Stainless-Timeout": String(Math.trunc(options.timeout / 1000)) } : {},
        ...getPlatformHeaders(),
        ...this._options.dangerouslyAllowBrowser ? { "anthropic-dangerous-direct-browser-access": "true" } : undefined,
        "anthropic-version": "2023-06-01"
      },
      await this.authHeaders(options),
      this._options.defaultHeaders,
      bodyHeaders,
      options.headers
    ]);
    this.validateHeaders(headers);
    return headers.values;
  }
  buildBody({ options: { body: body2, headers: rawHeaders } }) {
    if (!body2) {
      return { bodyHeaders: undefined, body: undefined };
    }
    const headers = buildHeaders([rawHeaders]);
    if (ArrayBuffer.isView(body2) || body2 instanceof ArrayBuffer || body2 instanceof DataView || typeof body2 === "string" && headers.values.has("content-type") || globalThis.Blob && body2 instanceof globalThis.Blob || body2 instanceof FormData || body2 instanceof URLSearchParams || globalThis.ReadableStream && body2 instanceof globalThis.ReadableStream) {
      return { bodyHeaders: undefined, body: body2 };
    } else if (typeof body2 === "object" && ((Symbol.asyncIterator in body2) || (Symbol.iterator in body2) && ("next" in body2) && typeof body2.next === "function")) {
      return { bodyHeaders: undefined, body: ReadableStreamFrom(body2) };
    } else {
      return __classPrivateFieldGet(this, _BaseAnthropic_encoder, "f").call(this, { body: body2, headers });
    }
  }
}
_a = BaseAnthropic, _BaseAnthropic_encoder = new WeakMap, _BaseAnthropic_instances = new WeakSet, _BaseAnthropic_baseURLOverridden = function _BaseAnthropic_baseURLOverridden2() {
  return this.baseURL !== "https://api.anthropic.com";
};
BaseAnthropic.Anthropic = _a;
BaseAnthropic.HUMAN_PROMPT = HUMAN_PROMPT;
BaseAnthropic.AI_PROMPT = AI_PROMPT;
BaseAnthropic.DEFAULT_TIMEOUT = 600000;
BaseAnthropic.AnthropicError = AnthropicError;
BaseAnthropic.APIError = APIError;
BaseAnthropic.APIConnectionError = APIConnectionError;
BaseAnthropic.APIConnectionTimeoutError = APIConnectionTimeoutError;
BaseAnthropic.APIUserAbortError = APIUserAbortError;
BaseAnthropic.NotFoundError = NotFoundError;
BaseAnthropic.ConflictError = ConflictError;
BaseAnthropic.RateLimitError = RateLimitError;
BaseAnthropic.BadRequestError = BadRequestError;
BaseAnthropic.AuthenticationError = AuthenticationError;
BaseAnthropic.InternalServerError = InternalServerError;
BaseAnthropic.PermissionDeniedError = PermissionDeniedError;
BaseAnthropic.UnprocessableEntityError = UnprocessableEntityError;
BaseAnthropic.toFile = toFile;

class Anthropic extends BaseAnthropic {
  constructor() {
    super(...arguments);
    this.completions = new Completions(this);
    this.messages = new Messages2(this);
    this.models = new Models2(this);
    this.beta = new Beta(this);
  }
}
Anthropic.Completions = Completions;
Anthropic.Messages = Messages2;
Anthropic.Models = Models2;
Anthropic.Beta = Beta;
// src/orchestrator/monitor/haiku-summarizer.ts
var PROMPTS = {
  read: "Summarize this file content in 2-3 sentences. Focus on: what the file does, key exports/functions, and its role in the codebase.",
  edit: "Summarize this code diff in 2-3 sentences. Focus on: what changed, why it might have changed, and the impact.",
  result: "Summarize this AI agent result in 2-3 sentences. Focus on: what was accomplished and key findings.",
  error: "Summarize this error in 1-2 sentences. Focus on: the root cause and suggested fix.",
  output: "Summarize this output in 2-3 sentences. Focus on: what happened and key information."
};
function truncate(str, maxLength) {
  if (str.length <= maxLength)
    return str;
  return str.substring(0, maxLength) + "...";
}
async function summarizeWithHaiku(content, type, logPath, options = {}) {
  const threshold = options.threshold || parseInt(process.env.SMITHERS_SUMMARY_THRESHOLD || "50");
  const lineCount = content.split(`
`).length;
  if (lineCount < threshold) {
    return {
      summary: content,
      fullPath: logPath
    };
  }
  const apiKey = options.apiKey || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      summary: truncate(content, 500) + `
[... truncated, see full output]`,
      fullPath: logPath
    };
  }
  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: "claude-3-haiku-20240307",
      max_tokens: 150,
      messages: [
        {
          role: "user",
          content: `${PROMPTS[type]}

---
${content}`
        }
      ]
    });
    const text = response.content[0];
    const summary = text.type === "text" ? text.text : content;
    return {
      summary,
      fullPath: logPath
    };
  } catch (error2) {
    return {
      summary: truncate(content, 500) + `
[... summarization failed, see full output]`,
      fullPath: logPath
    };
  }
}

// src/orchestrator/commands/monitor.ts
async function monitor(fileArg, options = {}) {
  const file = fileArg || options.file || ".smithers/main.tsx";
  const filePath = path5.resolve(file);
  const enableSummary = options.summary !== false;
  if (!fs5.existsSync(filePath)) {
    console.error(`❌ File not found: ${filePath}`);
    console.log("");
    console.log("Did you run `smithers init` first?");
    console.log("");
    process.exit(1);
  }
  try {
    fs5.accessSync(filePath, fs5.constants.X_OK);
  } catch {
    fs5.chmodSync(filePath, "755");
  }
  const parser = new OutputParser;
  const formatter = new StreamFormatter;
  const logWriter = new LogWriter;
  console.log(formatter.formatHeader(filePath));
  const startTime = Date.now();
  const child = spawn2("bun", ["-i", filePath], {
    stdio: ["inherit", "pipe", "pipe"],
    shell: true
  });
  child.stdout?.on("data", async (data) => {
    const chunk = data.toString();
    const events = parser.parseChunk(chunk);
    for (const event of events) {
      let logPath;
      let summary;
      if (event.type === "tool" && event.raw) {
        logPath = logWriter.writeToolCall(event.data.name, {}, event.raw);
        if (enableSummary) {
          const summaryResult = await summarizeWithHaiku(event.raw, "output", logPath);
          summary = summaryResult.summary;
        }
      } else if (event.type === "error") {
        logPath = logWriter.writeError(event.data.message);
      } else if (event.type === "agent" && event.data.status === "COMPLETE") {
        logPath = logWriter.writeAgentResult(event.data.name, event.raw);
        if (enableSummary && event.raw.length > 200) {
          const summaryResult = await summarizeWithHaiku(event.raw, "result", logPath);
          summary = summaryResult.summary;
        }
      }
      const formatted = formatter.formatEvent(event, logPath, summary);
      if (formatted) {
        process.stdout.write(formatted);
      }
    }
  });
  child.stderr?.on("data", async (data) => {
    const chunk = data.toString();
    const logPath = logWriter.writeError(chunk);
    let summary;
    if (enableSummary && chunk.split(`
`).length > 10) {
      const summaryResult = await summarizeWithHaiku(chunk, "error", logPath);
      summary = summaryResult.summary;
    }
    process.stderr.write(`[${new Date().toTimeString().substring(0, 8)}] ✗ ERROR:
`);
    if (summary) {
      process.stderr.write(`           ${summary}
`);
    } else {
      process.stderr.write(`           ${chunk}`);
    }
    process.stderr.write(`           \uD83D\uDCC4 Full error: ${logPath}

`);
  });
  child.on("error", (error2) => {
    console.error("");
    console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.error("");
    console.error("❌ Execution failed:", error2.message);
    console.error("");
    if (error2.message.includes("ENOENT")) {
      console.error("Bun not found. Install it:");
      console.error("   curl -fsSL https://bun.sh/install | bash");
      console.error("");
    }
    const logPath = logWriter.writeError(error2);
    console.error(`\uD83D\uDCC4 Error log: ${logPath}`);
    console.error("");
    process.exit(1);
  });
  child.on("exit", (code) => {
    const remainingEvents = parser.flush();
    for (const event of remainingEvents) {
      const formatted = formatter.formatEvent(event);
      if (formatted) {
        process.stdout.write(formatted);
      }
    }
    const duration = Date.now() - startTime;
    console.log(formatter.formatSummary(duration, logWriter.getLogDir()));
    if (code === 0) {
      console.log("✅ Orchestration completed successfully");
      console.log("");
    } else {
      console.log(`❌ Orchestration exited with code: ${code}`);
      console.log("");
    }
    process.exit(code || 0);
  });
}

// src/orchestrator/db/index.ts
init_dist();
init_state();
init_memories();
init_execution();
init_vcs();
import * as fs7 from "fs/promises";
import * as path6 from "path";
import { fileURLToPath as fileURLToPath2 } from "url";
async function createSmithersDB(options = {}) {
  const pg = await We2.create({
    dataDir: options.path
  });
  if (options.reset) {
    await resetDatabase(pg);
  }
  await initializeSchema(pg, options.customSchema);
  const stateManager = new StateManager(pg);
  const memoryManager = new MemoryManager(pg);
  const executionManager = new ExecutionManager(pg);
  const queryHelpers = new QueryHelpers(pg);
  let vcsManager = null;
  const getVCSManager = () => {
    if (!vcsManager) {
      const executionId = executionManager.currentExecutionId;
      if (!executionId) {
        throw new Error("No active execution. Call db.execution.start() first.");
      }
      vcsManager = new VCSManager(pg, executionId);
    }
    return vcsManager;
  };
  const vcsManagers = new Map;
  const db = {
    pg,
    getVCSManager: (executionId) => {
      if (!vcsManagers.has(executionId)) {
        vcsManagers.set(executionId, new VCSManager(pg, executionId));
      }
      return vcsManagers.get(executionId);
    },
    state: {
      get: (key) => stateManager.get(key),
      set: (key, value, trigger) => stateManager.set(key, value, trigger),
      setMany: (updates, trigger) => stateManager.setMany(updates, trigger),
      getAll: () => stateManager.getAll(),
      reset: () => stateManager.reset(),
      history: (key, limit) => key ? stateManager.getHistory(key, limit) : stateManager.getRecentTransitions(limit),
      replayTo: (transitionId) => stateManager.replayTo(transitionId),
      snapshot: () => stateManager.snapshot(),
      restore: (snapshot, trigger) => stateManager.restore(snapshot, trigger)
    },
    memories: {
      add: (memory) => memoryManager.add(memory),
      get: (category, key, scope) => memoryManager.get(category, key, scope),
      list: (category, scope, limit) => memoryManager.list(category, scope, limit),
      search: (query, category, limit) => memoryManager.search(query, category, limit),
      update: (id, updates) => memoryManager.update(id, updates),
      delete: (id) => memoryManager.delete(id),
      addFact: (key, content, source) => memoryManager.addFact(key, content, source),
      addLearning: (key, content, source) => memoryManager.addLearning(key, content, source),
      addPreference: (key, content, scope) => memoryManager.addPreference(key, content, scope),
      stats: () => memoryManager.getStats()
    },
    execution: {
      start: (name2, filePath, config) => executionManager.startExecution(name2, filePath, config),
      complete: (id, result) => executionManager.completeExecution(id, result),
      fail: (id, error2) => executionManager.failExecution(id, error2),
      cancel: (id) => executionManager.cancelExecution(id),
      current: () => executionManager.getCurrentExecution(),
      get: (id) => executionManager.getExecution(id),
      list: (limit) => executionManager.listExecutions(limit),
      findIncomplete: () => executionManager.findIncompleteExecution()
    },
    phases: {
      start: (name2, iteration) => executionManager.startPhase(name2, iteration),
      complete: (id) => executionManager.completePhase(id),
      fail: (id) => executionManager.failPhase(id),
      current: () => executionManager.getCurrentPhase(),
      list: (executionId) => executionManager.getPhases(executionId)
    },
    agents: {
      start: (prompt, model, systemPrompt) => executionManager.startAgent(prompt, model, systemPrompt),
      complete: (id, result, structuredResult, tokens) => executionManager.completeAgent(id, result, structuredResult, tokens),
      fail: (id, error2) => executionManager.failAgent(id, error2),
      current: () => executionManager.getCurrentAgent(),
      list: (executionId) => executionManager.getAgents(executionId)
    },
    steps: {
      start: (name2) => executionManager.startStep(name2),
      complete: (id, vcsInfo) => executionManager.completeStep(id, vcsInfo),
      fail: (id) => executionManager.failStep(id),
      current: () => executionManager.getCurrentStep(),
      list: (phaseId) => executionManager.getSteps(phaseId),
      getByExecution: (executionId) => executionManager.getStepsByExecution(executionId)
    },
    tools: {
      start: (agentId, toolName, input) => executionManager.startToolCall(agentId, toolName, input),
      complete: (id, output, summary) => executionManager.completeToolCall(id, output, summary),
      fail: (id, error2) => executionManager.failToolCall(id, error2),
      list: (agentId) => executionManager.getToolCalls(agentId),
      getOutput: (id) => executionManager.getToolCallOutput(id)
    },
    artifacts: {
      add: (name2, type, filePath, agentId, metadata2) => executionManager.addArtifact(name2, type, filePath, agentId, metadata2),
      list: (executionId) => executionManager.getArtifacts(executionId)
    },
    vcs: {
      logCommit: (commit) => getVCSManager().logCommit(commit),
      getCommits: (limit) => getVCSManager().getCommits(limit),
      getCommit: (hash, vcsType) => getVCSManager().getCommit(hash, vcsType),
      logSnapshot: (snapshot) => getVCSManager().logSnapshot(snapshot),
      getSnapshots: (limit) => getVCSManager().getSnapshots(limit),
      logReview: (review) => getVCSManager().logReview(review),
      updateReview: (id, updates) => getVCSManager().updateReview(id, updates),
      getReviews: (limit) => getVCSManager().getReviews(limit),
      getBlockingReviews: () => getVCSManager().getBlockingReviews(),
      addReport: (report) => getVCSManager().addReport(report),
      getReports: (type, limit) => getVCSManager().getReports(type, limit),
      getCriticalReports: () => getVCSManager().getCriticalReports()
    },
    query: (sql, params) => queryHelpers.query(sql, params),
    close: () => pg.close()
  };
  return db;
}
async function initializeSchema(pg, customSchema) {
  let schemaPath;
  try {
    const currentFileUrl = import.meta.url;
    if (currentFileUrl.startsWith("file://")) {
      const currentDir = path6.dirname(fileURLToPath2(currentFileUrl));
      schemaPath = path6.join(currentDir, "schema.sql");
    } else {
      schemaPath = path6.resolve(process.cwd(), "src/orchestrator/db/schema.sql");
    }
  } catch {
    schemaPath = path6.resolve(process.cwd(), "src/orchestrator/db/schema.sql");
  }
  const schemaSql = await fs7.readFile(schemaPath, "utf-8");
  await pg.exec(schemaSql);
  if (customSchema) {
    await pg.exec(customSchema);
  }
}
async function resetDatabase(pg) {
  await pg.exec(`
    DROP TABLE IF EXISTS steps CASCADE;
    DROP TABLE IF EXISTS reviews CASCADE;
    DROP TABLE IF EXISTS snapshots CASCADE;
    DROP TABLE IF EXISTS commits CASCADE;
    DROP TABLE IF EXISTS reports CASCADE;
    DROP TABLE IF EXISTS artifacts CASCADE;
    DROP TABLE IF EXISTS transitions CASCADE;
    DROP TABLE IF EXISTS state CASCADE;
    DROP TABLE IF EXISTS tool_calls CASCADE;
    DROP TABLE IF EXISTS agents CASCADE;
    DROP TABLE IF EXISTS phases CASCADE;
    DROP TABLE IF EXISTS executions CASCADE;
    DROP TABLE IF EXISTS memories CASCADE;
  `);
}

// src/orchestrator/commands/db.ts
async function dbCommand(subcommand, options = {}) {
  if (!subcommand) {
    showHelp();
    return;
  }
  const dbPath = options.path || ".smithers/data";
  console.log(`\uD83D\uDCCA Smithers Database Inspector`);
  console.log(`   Database: ${dbPath}`);
  console.log("");
  const db = await createSmithersDB({ path: dbPath });
  try {
    switch (subcommand) {
      case "state":
        await showState(db);
        break;
      case "transitions":
        await showTransitions(db);
        break;
      case "executions":
        await showExecutions(db);
        break;
      case "memories":
        await showMemories(db);
        break;
      case "stats":
        await showStats(db);
        break;
      case "current":
        await showCurrent(db);
        break;
      case "recovery":
        await showRecovery(db);
        break;
      default:
        showHelp();
    }
  } finally {
    await db.close();
  }
}
async function showState(db) {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("CURRENT STATE");
  console.log("═══════════════════════════════════════════════════════════");
  console.log("");
  const state = await db.state.getAll();
  if (Object.keys(state).length === 0) {
    console.log("  (empty state)");
  } else {
    for (const [key, value] of Object.entries(state)) {
      console.log(`  ${key}:`, JSON.stringify(value, null, 2).split(`
`).join(`
    `));
    }
  }
  console.log("");
}
async function showTransitions(db) {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("STATE TRANSITIONS (last 20)");
  console.log("═══════════════════════════════════════════════════════════");
  console.log("");
  const transitions = await db.state.history(undefined, 20);
  if (transitions.length === 0) {
    console.log("  (no transitions)");
  } else {
    for (const t2 of transitions) {
      const time = new Date(t2.created_at).toLocaleString();
      const oldVal = t2.old_value ? JSON.stringify(t2.old_value) : "null";
      const newVal = JSON.stringify(t2.new_value);
      const trigger = t2.trigger || "unknown";
      console.log(`  [${time}] ${t2.key}`);
      console.log(`    ${oldVal} → ${newVal}`);
      console.log(`    Trigger: ${trigger}`);
      console.log("");
    }
  }
}
async function showExecutions(db) {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("RECENT EXECUTIONS (last 10)");
  console.log("═══════════════════════════════════════════════════════════");
  console.log("");
  const executions = await db.execution.list(10);
  if (executions.length === 0) {
    console.log("  (no executions)");
  } else {
    for (const exec2 of executions) {
      const status = exec2.status.toUpperCase();
      const symbol = status === "COMPLETED" ? "✓" : status === "FAILED" ? "✗" : "●";
      console.log(`  ${symbol} ${exec2.name || "Unnamed"}`);
      console.log(`    ID: ${exec2.id}`);
      console.log(`    Status: ${status}`);
      console.log(`    File: ${exec2.file_path}`);
      if (exec2.started_at) {
        console.log(`    Started: ${new Date(exec2.started_at).toLocaleString()}`);
      }
      if (exec2.completed_at) {
        const duration = new Date(exec2.completed_at).getTime() - new Date(exec2.started_at).getTime();
        console.log(`    Duration: ${duration}ms`);
      }
      console.log(`    Agents: ${exec2.total_agents}, Tools: ${exec2.total_tool_calls}, Tokens: ${exec2.total_tokens_used}`);
      if (exec2.error) {
        console.log(`    Error: ${exec2.error}`);
      }
      console.log("");
    }
  }
}
async function showMemories(db) {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("MEMORIES");
  console.log("═══════════════════════════════════════════════════════════");
  console.log("");
  const stats = await db.memories.stats();
  console.log(`  Total: ${stats.total}`);
  console.log("");
  console.log("  By Category:");
  for (const [category, count] of Object.entries(stats.byCategory)) {
    console.log(`    ${category}: ${count}`);
  }
  console.log("");
  console.log("  By Scope:");
  for (const [scope, count] of Object.entries(stats.byScope)) {
    console.log(`    ${scope}: ${count}`);
  }
  console.log("");
  const recent = await db.memories.list(undefined, undefined, 5);
  if (recent.length > 0) {
    console.log("  Recent Memories:");
    console.log("");
    for (const m4 of recent) {
      console.log(`    [${m4.category}] ${m4.key}`);
      console.log(`      ${m4.content.substring(0, 100)}${m4.content.length > 100 ? "..." : ""}`);
      console.log(`      Confidence: ${m4.confidence}, Source: ${m4.source || "unknown"}`);
      console.log("");
    }
  }
}
async function showStats(db) {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("DATABASE STATISTICS");
  console.log("═══════════════════════════════════════════════════════════");
  console.log("");
  const tables = [
    "executions",
    "phases",
    "agents",
    "tool_calls",
    "memories",
    "state",
    "transitions",
    "artifacts"
  ];
  for (const table of tables) {
    const result = await db.query(`SELECT COUNT(*) as count FROM ${table}`);
    const count = result[0]?.count || 0;
    console.log(`  ${table.padEnd(15)}: ${count}`);
  }
  console.log("");
}
async function showCurrent(db) {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("CURRENT EXECUTION");
  console.log("═══════════════════════════════════════════════════════════");
  console.log("");
  const execution = await db.execution.current();
  if (!execution) {
    console.log("  (no active execution)");
    console.log("");
    return;
  }
  console.log(`  Name: ${execution.name || "Unnamed"}`);
  console.log(`  ID: ${execution.id}`);
  console.log(`  Status: ${execution.status.toUpperCase()}`);
  console.log(`  File: ${execution.file_path}`);
  console.log("");
  const phase = await db.phases.current();
  if (phase) {
    console.log(`  Current Phase: ${phase.name} (iteration ${phase.iteration})`);
    console.log(`  Phase Status: ${phase.status.toUpperCase()}`);
    console.log("");
  }
  const agent = await db.agents.current();
  if (agent) {
    console.log(`  Current Agent: ${agent.model}`);
    console.log(`  Agent Status: ${agent.status.toUpperCase()}`);
    console.log(`  Prompt: ${agent.prompt.substring(0, 100)}...`);
    console.log("");
  }
  if (agent) {
    const tools = await db.tools.list(agent.id);
    if (tools.length > 0) {
      console.log(`  Recent Tool Calls (${tools.length}):`);
      for (const tool of tools.slice(-5)) {
        console.log(`    - ${tool.tool_name} (${tool.status})`);
      }
      console.log("");
    }
  }
  const state = await db.state.getAll();
  console.log("  State:");
  for (const [key, value] of Object.entries(state)) {
    console.log(`    ${key}: ${JSON.stringify(value)}`);
  }
  console.log("");
}
async function showRecovery(db) {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("CRASH RECOVERY");
  console.log("═══════════════════════════════════════════════════════════");
  console.log("");
  const incomplete = await db.execution.findIncomplete();
  if (!incomplete) {
    console.log("  ✓ No incomplete executions found");
    console.log("  No recovery needed");
    console.log("");
    return;
  }
  console.log("  ⚠️  Found incomplete execution!");
  console.log("");
  console.log(`  Name: ${incomplete.name || "Unnamed"}`);
  console.log(`  ID: ${incomplete.id}`);
  console.log(`  File: ${incomplete.file_path}`);
  console.log(`  Started: ${new Date(incomplete.started_at).toLocaleString()}`);
  console.log("");
  const state = await db.state.getAll();
  console.log("  Last Known State:");
  for (const [key, value] of Object.entries(state)) {
    console.log(`    ${key}: ${JSON.stringify(value)}`);
  }
  console.log("");
  const transitions = await db.state.history(undefined, 5);
  console.log(`  Last ${transitions.length} Transitions:`);
  for (const t2 of transitions) {
    console.log(`    ${new Date(t2.created_at).toLocaleString()}: ${t2.key} = ${JSON.stringify(t2.new_value)}`);
  }
  console.log("");
  console.log("  Recovery Options:");
  console.log("    1. Resume from last state (if possible)");
  console.log("    2. Restart from beginning");
  console.log("    3. Mark as failed and start new execution");
  console.log("");
}
function showHelp() {
  console.log("Usage: smithers db <subcommand> [options]");
  console.log("");
  console.log("Subcommands:");
  console.log("  state        Show current state");
  console.log("  transitions  Show state transition history");
  console.log("  executions   Show recent executions");
  console.log("  memories     Show memories");
  console.log("  stats        Show database statistics");
  console.log("  current      Show current execution details");
  console.log("  recovery     Check for incomplete executions (crash recovery)");
  console.log("");
  console.log("Options:");
  console.log("  --path <path>  Database path (default: .smithers/data)");
  console.log("");
}

// bin/cli.ts
var program2 = new Command;
program2.name("smithers").description("CLI tool for multi-agent AI orchestration with Smithers framework").version("0.1.0");
program2.command("init").description("Create a new Smithers orchestration in .smithers/").option("-d, --dir <directory>", "Directory to create .smithers in", process.cwd()).action(init2);
program2.command("run [file]").description("Run a Smithers orchestration file").option("-f, --file <file>", "Orchestration file to run", ".smithers/main.tsx").action(run2);
program2.command("monitor [file]").description("Run with LLM-friendly monitoring (recommended)").option("-f, --file <file>", "Orchestration file to monitor", ".smithers/main.tsx").option("--no-summary", "Disable Haiku summarization").action(monitor);
program2.command("db [subcommand]").description("Inspect and manage the PGlite database").option("--path <path>", "Database path", ".smithers/data").action(dbCommand);
program2.command("hook-trigger <type> <data>").description("Trigger a hook event (used by git hooks)").option("--path <path>", "Database path", ".smithers/data").action(async (type, data, options) => {
  try {
    const { createSmithersDB: createSmithersDB3 } = await Promise.resolve().then(() => (init_db(), exports_db));
    const db = await createSmithersDB3({ path: options.path });
    await db.state.set("last_hook_trigger", {
      type,
      data,
      timestamp: Date.now()
    });
    await db.close();
    console.log(`[Hook] Triggered: ${type} with ${data}`);
  } catch (error2) {
    console.error("[Hook] Error:", error2);
    process.exit(1);
  }
});
program2.parse(process.argv);
