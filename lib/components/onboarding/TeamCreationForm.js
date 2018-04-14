import React, { Component } from "react";
import { FormattedMessage } from "react-intl";
import { connect } from "react-redux";
import Button from "./Button";
import UnexpectedErrorMessage from "./UnexpectedErrorMessage";
import { createTeam, backToInvite } from "../../actions/onboarding";

export class SimpleTeamCreationForm extends Component {
	constructor(props) {
		super(props);
		this.state = {
			name: "",
			nameTouched: false
		};
	}

	onBlurName = () => this.setState(state => ({ nameTouched: true }));

	onSubmit = () => this.props.createTeam(this.state.name);

	renderErrors = () => {
		if (this.props.errors.invalidRepoUrl)
			return (
				<span className="error-message">
					<FormattedMessage
						id="createTeam.invalidRepoUrl"
						defaultMessage="Your repository's origin url is invalid. Please correct it and reload atom to try again."
					/>
				</span>
			);
		if (this.props.errors.unknown) return <UnexpectedErrorMessage classes="error-message" />;
	};

	render() {
		let goBack = "";
		if (this.props.showBackButton) {
			goBack = (
				<div className="footer">
					<br />
					<p>
						<a onClick={this.props.backToInvite}>
							<FormattedMessage id="createTeam.backToInvite" defaultMessage="Go Back" />
						</a>
					</p>
				</div>
			);
		}
		return (
			<div id="team-creation">
				<h2>
					<FormattedMessage id="createTeam.header" />
				</h2>
				<p>
					<FormattedMessage id="createTeam.info" />
				</p>
				{this.renderErrors()}
				<form onSubmit={this.onSubmit}>
					<input
						className="native-key-bindings input-text control"
						placeholder="Team Name"
						onChange={event => this.setState({ name: event.target.value })}
						value={this.state.name}
						onBlur={this.onBlurName}
						required={this.state.touched}
					/>
					<Button id="submit-button" disabled={this.state.name === ""} loading={this.props.loading}>
						<FormattedMessage id="createTeam.submitButton" />
					</Button>
				</form>
				{goBack}
			</div>
		);
	}
}

const mapStateToProps = ({ onboarding }) => ({
	showBackButton: onboarding.fromInvite,
	loading: onboarding.requestInProcess,
	errors: onboarding.errors
});
export default connect(mapStateToProps, { createTeam, backToInvite })(SimpleTeamCreationForm);
