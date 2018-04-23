import { shell } from "electron";
import React, { Component } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import Raven from "raven-js";
import NoGit from "./NoGit";
import TooMuchGit from "./TooMuchGit";
import Onboarding from "./onboarding/Onboarding";
import Pages from "./Pages";
import Stream from "./Stream";
import NoAccess from "./NoAccess";
import OfflineBanner from "./OfflineBanner";
import SlackInfo from "./SlackInfo";
import withConfigs from "./withConfigs";

const Loading = props => (
	<div className="loading-page">
		<span className="loading loading-spinner-large inline-block" />
		<p>{props.message}</p>
	</div>
);

class CodeStreamRoot extends Component {
	static defaultProps = {
		repositories: [],
		user: {}
	};

	static childContextTypes = {
		repositories: PropTypes.array
	};

	constructor(props) {
		super(props);
		this.state = {};
	}

	getChildContext() {
		return {
			repositories: this.props.repositories
		};
	}

	componentDidCatch(error, info) {
		this.setState({ hasError: true });
		Raven.captureException(error, { extra: info });
	}

	render() {
		const {
			catchingUp,
			accessToken,
			currentPage,
			bootstrapped,
			repositories,
			onboarding,
			noAccess,
			showSlackInfo
		} = this.props;

		if (this.state.hasError)
			return (
				<div id="oops">
					<p>An unexpected error has occurred and we've been notified.</p>
					<p>
						Please run the `Codestream: Logout` command from the command palette and{" "}
						<a onClick={atom.reload.bind(atom)}>reload</a> atom.
					</p>
					<p>
						Sorry for the inconvenience. If the problem persists, please{" "}
						<a onClick={() => shell.openExternal("https://help.codestream.com")}>contact support</a>.
					</p>
				</div>
			);
		if (repositories.length === 0) return <NoGit />;
		if (repositories.length > 1) return <TooMuchGit />;
		if (noAccess) return <NoAccess reason={noAccess} />;
		if (!bootstrapped) return <Loading message="CodeStream engage..." />;
		if (catchingUp) return <Loading message="Hold on, we're catching you up" />;
		if (showSlackInfo) return <SlackInfo />;
		else if (onboarding.complete && accessToken) {
			if (currentPage)
				return [
					<OfflineBanner key="offline-banner" />,
					<Pages key="onboarding" page={currentPage} />
				];
			else return [<OfflineBanner key="offline-banner" />, <Stream key="stream" />];
		} else return [<OfflineBanner key="offline-banner" />, <Onboarding key="onboarding" />];
	}
}

const mapStateToProps = ({
	bootstrapped,
	currentPage,
	session,
	onboarding,
	context,
	messaging
}) => ({
	accessToken: session.accessToken,
	noAccess: context.noAccess,
	catchingUp: messaging.catchingUp,
	showSlackInfo: context.showSlackInfo,
	currentPage,
	bootstrapped,
	onboarding
});
export default connect(mapStateToProps)(withConfigs(CodeStreamRoot));
