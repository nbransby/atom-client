import { upsert } from "../local-cache";
import { setCurrentTeam } from "./context";
import { saveUser, saveUsers } from "./user";
import { saveRepo } from "./repo";
import { saveCompany } from "./company";
import { normalize } from "./utils";

export const saveTeam = attributes => (dispatch, getState, { db }) => {
	return upsert(db, "teams", attributes).then(team =>
		dispatch({ type: "ADD_TEAM", payload: team })
	);
};

export const saveTeams = attributes => (dispatch, getState, { db }) => {
	return upsert(db, "teams", attributes).then(teams =>
		dispatch({ type: "ADD_TEAMS", payload: teams })
	);
};

export const fetchTeamMembers = teamId => (dispatch, getState, { http }) => {
	if (Array.isArray(teamId)) return Promise.all(teamId.map(id => dispatch(fetchTeamMembers(id))));
	const { session } = getState();

	return http
		.get(`/users?teamId=${teamId}`, session.accessToken)
		.then(({ users }) => dispatch(saveUsers(normalize(users))));
};

export const joinTeam = () => (dispatch, getState, { http }) => {
	const { repoAttributes, session } = getState();
	return http.post("/repos", repoAttributes, session.accessToken).then(async data => {
		await dispatch(saveCompany(normalize(data.company)));
		await dispatch(saveTeam(normalize(data.team)));
		// FIXME:
		if (data.users) await dispatch(saveUsers(normalize(data.users)));
		await dispatch(fetchTeamMembers(data.repo.teamId));
		await dispatch(saveRepo(normalize(data.repo)));
		return dispatch(setCurrentTeam(data.repo.teamId));
	});
};

export const invite = attributes => (dispatch, getState, { http }) => {
	const { session } = getState();
	return http
		.post("/users", attributes, session.accessToken)
		.then(data => dispatch(saveUser(normalize(data.user))));
};
