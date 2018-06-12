import _ from "underscore-plus";
import React from "react";
import ContentEditable from "react-contenteditable";
import createClassString from "classnames";
import AtMentionsPopup from "./AtMentionsPopup";

class ComposeBox extends React.Component {
	state = { newPostText: "", quote: null, autoMentions: [] };
	disposables = [];

	componentDidMount() {
		window.addEventListener("message", this.handleInteractionEvent, true);

		// so that HTML doesn't get pasted into the input field. without this,
		// HTML would be rendered as HTML when pasted
		this._contentEditable.htmlEl.addEventListener("paste", function(e) {
			e.preventDefault();
			const text = e.clipboardData.getData("text/plain");
			document.execCommand("insertHTML", false, text.replace(/\n/g, "<br>"));
		});

		// because atom hijacks most keystroke events
		if (global.atom) {
			this.disposables.push(
				atom.commands.add("atom-workspace", {
					"codestream:focus-input": _event => this.focus()
				}),
				atom.commands.add(".codestream", "codestream:escape", {
					didDispatch: event => this.handleAtMentionKeyPress(event, "escape"),
					hiddenInCommandPalette: true
				}),
				atom.commands.add(".codestream .compose.mentions-on", "codestream:at-mention-move-up", {
					didDispatch: event => this.handleAtMentionKeyPress(event, "up"),
					hiddenInCommandPalette: true
				}),
				atom.commands.add(".codestream .compose.mentions-on", "codestream:at-mention-move-down", {
					didDispatch: event => this.handleAtMentionKeyPress(event, "down"),
					hiddenInCommandPalette: true
				}),
				atom.commands.add(".codestream .compose.mentions-on", "codestream:at-mention-tab", {
					didDispatch: event => this.handleAtMentionKeyPress(event, "tab"),
					hiddenInCommandPalette: true
				}),
				atom.commands.add(".codestream .native-key-bindings", "codestream:move-up", {
					didDispatch: event => this.handleNonCapturedKeyPress(event, "up"),
					hiddenInCommandPalette: true
				})
			);
		}
	}

	componentWillUnmount() {
		this.disposables.forEach(d => d.dispose());
		window.removeEventListener("message", this.handleInteractionEvent, true);
	}

	handleInteractionEvent = ({ data }) => {
		if (data.type === "codestream:interaction:code-highlighted") {
			console.log("event data", data.body);
			this.focus();
			const { authors, ...state } = data.body;
			this.setState({ quote: state });

			const toAtmention = authors
				.map(email => _.findWhere(this.props.teammates, { email }))
				.filter(Boolean);
			if (toAtmention.length > 0) {
				// TODO handle users with no username
				const usernames = toAtmention.map(user => `@${user.username}`);
				this.setState({ autoMentions: usernames });
				// the reason for this unicode space is that chrome will
				// not render a space at the end of a contenteditable div
				// unless it is a &nbsp;, which is difficult to insert
				// so we insert this unicode character instead
				const newText = usernames.join(", ") + ":\u00A0";
				this.insertTextAtCursor(newText);
			}
		}
	};

	focus = () => {
		this._contentEditable.htmlEl.focus();
	};

	// set up the parameters to pass to the at mention popup
	showAtMentionSelectors(prefix) {
		let peopleToShow = [];

		Object.values(this.props.teammates).forEach(person => {
			let toMatch = person.firstName + " " + person.lastName + "*" + person.username; // + "*" + person.email;
			let lowered = toMatch.toLowerCase();
			if (lowered.indexOf(prefix) !== -1) {
				peopleToShow.push(person);
			}
		});

		if (peopleToShow.length == 0) {
			this.setState({
				atMentionsOn: false
			});
		} else {
			let selected = peopleToShow[0].id;

			this.setState({
				atMentionsOn: true,
				atMentionsPrefix: prefix,
				atMentionsPeople: peopleToShow,
				atMentionsIndex: 0,
				selectedAtMention: selected
			});
		}
	}

	hideAtMentionSelectors() {
		this.setState({ atMentionsOn: false });
	}

	selectFirstAtMention() {
		this.handleSelectAtMention();
	}

	// insert the given text at the cursor of the input field
	// after first deleting the text in toDelete
	insertTextAtCursor(text, toDelete) {
		var sel, range;
		sel = window.getSelection();

		// if for some crazy reason we can't find a selection, return
		// to avoid an error.
		// https://stackoverflow.com/questions/22935320/uncaught-indexsizeerror-failed-to-execute-getrangeat-on-selection-0-is-not
		if (sel.rangeCount == 0) return;

		range = sel.getRangeAt(0);

		// delete the X characters before the caret
		range.setStart(range.commonAncestorContainer, range.startOffset - (toDelete || "").length);
		// range.moveEnd("character", toDelete.length);

		range.deleteContents();
		var textNode = document.createTextNode(text);
		range.insertNode(textNode);
		range.setStartAfter(textNode);
		sel.removeAllRanges();
		sel.addRange(range);
		this._contentEditable.htmlEl.normalize();

		this.setState({ newPostText: this._contentEditable.htmlEl.innerHTML });
	}

	// the keypress handler for tracking up and down arrow
	// and enter, while the at mention popup is open
	handleAtMentionKeyPress(event, eventType) {
		if (eventType == "escape") {
			if (this.state.atMentionsOn) this.hideAtMentionSelectors();
			// else this.handleDismissThread();
		} else {
			let newIndex = 0;
			if (eventType == "down") {
				if (this.state.atMentionsIndex < this.state.atMentionsPeople.length - 1) {
					newIndex = this.state.atMentionsIndex + 1;
				} else {
					newIndex = 0;
				}
			} else if (eventType == "up") {
				if (this.state.atMentionsIndex == 0) {
					newIndex = this.state.atMentionsPeople.length - 1;
				} else {
					newIndex = this.state.atMentionsIndex - 1;
				}
			} else if (eventType == "tab") {
				this.selectFirstAtMention();
			}
			this.setState({
				atMentionsIndex: newIndex,
				selectedAtMention: this.state.atMentionsPeople[newIndex].id
			});
		}
	}

	// for keypresses that we can't capture with standard
	// javascript events
	handleNonCapturedKeyPress(event, eventType) {
		if (eventType == "up") {
			if (this.state.newPostText === "") {
				this.props.onEmptyUpArrow(event);
			}
		}
		event.abortKeyBinding();
	}

	// when the user hovers over an at-mention list item, change the
	// state to represent a hovered state
	handleHoverAtMention = id => {
		let index = this.state.atMentionsPeople.findIndex(x => x.id == id);

		this.setState({
			atMentionsIndex: index,
			selectedAtMention: id
		});
	};

	handleSelectAtMention = id => {
		// if no id is passed, we assume that we're selecting
		// the currently-selected at mention
		if (!id) {
			id = this.state.selectedAtMention;
		}

		let user = this.props.teammates.find(t => t.id === id);
		if (!user) return;
		let username = user.username;
		// otherwise explicitly use the one passed in
		// FIXME -- this should anchor at the carat, not end-of-line
		// var re = new RegExp("@" + this.state.atMentionsPrefix);
		this.setState({
			atMentionsOn: false
		});
		// the reason for this unicode space is that chrome will
		// not render a space at the end of a contenteditable div
		// unless it is a &nbsp;, which is difficult to insert
		// so we insert this unicode character instead
		let toInsert = username + "\u00A0";
		setTimeout(() => {
			this.focus();
		}, 20);
		this.insertTextAtCursor(toInsert, this.state.atMentionsPrefix);
		// this.setNewPostText(text);
	};

	// depending on the contents of the input field, if the user
	// types a "@" then open the at-mention popup
	handleChange = event => {
		var newPostText = event.target.value;

		let selection = window.getSelection();
		let range = selection.getRangeAt(0);
		let node = range.commonAncestorContainer;
		let nodeText = node.textContent || "";
		let upToCursor = nodeText.substring(0, range.startOffset);
		var match = upToCursor.match(/@([a-zA-Z0-9_.+]*)$/);
		if (this.state.atMentionsOn) {
			if (match) {
				this.showAtMentionSelectors(match[0].replace(/@/, ""));
			} else {
				// if the line doesn't end with @word, then hide the popup
				this.setState({ atMentionsOn: false });
			}
		} else {
			if (match) {
				this.showAtMentionSelectors(match[0].replace(/@/, ""));
			}
		}
		// track newPostText as the user types
		this.setState({
			newPostText,
			autoMentions: this.state.autoMentions.filter(mention => newPostText.includes(mention))
		});
	};

	// when the input field loses focus, one thing we want to do is
	// to hide the at-mention popup
	handleBlur = event => {
		event.preventDefault();
		this.setState({
			atMentionsOn: false
		});
	};

	handleKeyPress = event => {
		var newPostText = this.state.newPostText;

		// if we have the at-mentions popup open, then the keys
		// do something different than if we have the focus in
		// the textarea
		if (this.state.atMentionsOn) {
			if (event.key == "Escape") {
				this.hideAtMentionSelectors();
			} else if (event.key == "Enter" && !event.shiftKey) {
				event.preventDefault();
				this.selectFirstAtMention();
			} else {
				var match = newPostText.match(/@([a-zA-Z0-9_.]*)$/);
				var text = match ? match[0].replace(/@/, "") : "";
				// this.showAtMentionSelectors(text);
			}
		} else if (event.key === "@") {
			this.showAtMentionSelectors("");
		} else if (event.key === "Enter" && !event.shiftKey) {
			event.preventDefault();
			if (newPostText.trim().length > 0 && !this.props.disabled) {
				// convert the text to plaintext so there is no HTML
				let text = newPostText.replace(/<br>/g, "\n");
				const doc = new DOMParser().parseFromString(text, "text/html");
				text = doc.documentElement.textContent;

				this.props.onSubmit({
					text,
					quote: this.state.quote,
					mentionedUserIds: this.props.findMentionedUserIds(text, this.props.teammates),
					autoMentions: this.state.autoMentions
				});
				this.reset();
			} else {
				// don't submit blank posts
			}
		}
	};

	handleClickDismissQuote = () => {
		this.focus();
		this.reset();
	};

	reset() {
		this.setState({ newPostText: "", quote: null, autoMentions: [] });
	}

	render() {
		const { forwardedRef, placeholder } = this.props;
		const { quote } = this.state;

		let quoteInfo;
		let quoteHint;
		if (quote) {
			quoteInfo = quote ? <div className="code">{quote.quoteText}</div> : "";
			let range = quote.quoteRange;
			let rangeText = null;
			if (range) {
				if (range.start.row === range.end.row) {
					rangeText = "Commenting on line " + (range.start.row + 1);
				} else {
					rangeText = "Commenting on lines " + (range.start.row + 1) + "-" + (range.end.row + 1);
				}
			}
			quoteHint = (
				<div className="hint">
					{rangeText}
					<span onClick={this.handleClickDismissQuote} className="icon icon-x" />
				</div>
			);
		}

		return (
			<div
				ref={forwardedRef}
				onKeyPress={this.handleKeyPress}
				onKeyDown={this.handleKeyDown}
				className={createClassString("compose", {
					"mentions-on": this.state.atMentionsOn
				})}
			>
				<AtMentionsPopup
					on={this.state.atMentionsOn}
					people={this.state.atMentionsPeople}
					usernames={this.usernameRegExp}
					prefix={this.state.atMentionsPrefix}
					selected={this.state.selectedAtMention}
					handleHoverAtMention={this.handleHoverAtMention}
					handleSelectAtMention={this.handleSelectAtMention}
				/>
				{quoteInfo}
				{quoteHint}
				<ContentEditable
					className={createClassString("native-key-bindings", btoa(placeholder))}
					id="input-div"
					rows="1"
					tabIndex="-1"
					onChange={this.handleChange}
					onBlur={this.handleBlur}
					html={this.state.newPostText}
					placeholder={placeholder}
					ref={ref => (this._contentEditable = ref)}
				/>
			</div>
		);
	}
}

export default React.forwardRef((props, ref) => <ComposeBox {...props} forwardedRef={ref} />);