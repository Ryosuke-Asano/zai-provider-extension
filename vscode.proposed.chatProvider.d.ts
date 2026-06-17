// Copied/adapted from VS Code repository (src/vscode-dts/vscode.proposed.chatProvider.d.ts).
// Declares the proposed `chatProvider` API surface used by this extension:
//   - `LanguageModelConfigurationSchema`
//   - `LanguageModelChatInformation.configurationSchema`
//   - `ProvideLanguageModelChatResponseOptions.modelConfiguration`
//
// Only additive declarations are included here (interface merging), so this file
// does not conflict with the stable `vscode.d.ts`. The stable
// `ProvideLanguageModelChatResponseOptions.modelOptions` remains available.
//
// To update: npx @vscode/dts dev
// Can be removed once the API graduates to stable.

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	/**
	 * A [JSON Schema](https://json-schema.org) describing configuration options
	 * for a language model. Each property in `properties` defines a configurable
	 * option using standard JSON Schema fields plus additional display hints.
	 *
	 * Declared via {@link LanguageModelChatInformation.configurationSchema}; the
	 * configured values are merged into the request options when sending chat
	 * requests to this model.
	 */
	export type LanguageModelConfigurationSchema = {
		readonly properties?: {
			readonly [key: string]: Record<string, any> & {
				/**
				 * Human-readable labels for enum values, shown instead of the raw values.
				 * Must have the same length and order as `enum`.
				 */
				readonly enumItemLabels?: string[];
				/**
				 * The group this property belongs to. When set to `'navigation'`, the
				 * property is shown as a primary action in the model picker.
				 */
				readonly group?: string;
			};
		};
	};

	export interface LanguageModelChatInformation {
		/**
		 * An optional JSON schema describing the configuration options for this model.
		 * When set, users can specify per-model configuration (e.g. a "Thinking Effort"
		 * picker shown next to the model picker). The configured values are forwarded
		 * to the provider via
		 * {@link ProvideLanguageModelChatResponseOptions.modelConfiguration}.
		 */
		readonly configurationSchema?: LanguageModelConfigurationSchema;
	}

	export interface ProvideLanguageModelChatResponseOptions {
		/**
		 * Per-model configuration provided by the user. Contains resolved values based
		 * on the model's {@link LanguageModelChatInformation.configurationSchema},
		 * with user overrides applied on top of schema defaults. This is the proposed
		 * counterpart to the stable `modelOptions`.
		 */
		readonly modelConfiguration?: { readonly [key: string]: any };
	}
}
