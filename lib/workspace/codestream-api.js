// @flow
import { shell } from "electron";
import AddCommentPopupManager from "./add-comment-popup-manager";
import BufferChangeTracker from "./buffer-change-tracker";
import DiffManager from "./diff-manager";
import ContentHighlighter from "./content-highlighter";
import MarkerLocationTracker from "./marker-location-tracker";
import EditTracker from "./edit-tracker";
import type { Resource, Store } from "../types";

export default class CodeStreamApi implements Resource {
	initialized: boolean = false;
	popupManager: Resource;
	bufferChangeTracker: Resource;
	diffManager: Resource;
	contentHighlighter: Resource;
	markerLocationTracker: Resource;
	editTracker: Resource;
	store: Store;

	constructor(store: Store) {
		this.store = store;
	}

	initialize() {
		const { repoAttributes } = this.store.getState();
		this.popupManager = new AddCommentPopupManager(repoAttributes.workingDirectory);
		this.bufferChangeTracker = new BufferChangeTracker(this.store, repoAttributes.workingDirectory);
		this.diffManager = new DiffManager(this.store);
		this.contentHighlighter = new ContentHighlighter(this.store);
		this.markerLocationTracker = new MarkerLocationTracker(this.store);
		this.editTracker = new EditTracker(this.store);
		window.addEventListener("message", this.handleInteractionEvent, true);
		this.initialized = true;
	}

	handleInteractionEvent = ({ data }) => {
		if (data.type === "codestream:interaction:clicked-link") {
			shell.openExternal(data.body);
		}
	};

	destroy() {
		if (this.initialized) {
		window.removeEventListener("message", this.handleInteractionEvent, true);
			this.popupManager.destroy();
			this.bufferChangeTracker.destroy();
			this.diffManager.destroy();
			this.contentHighlighter.destroy();
			this.markerLocationTracker.destroy();
			this.editTracker.destroy();
		}
	}
}