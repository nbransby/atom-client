import Dexie from "dexie";

const codestreamEnv = sessionStorage.getItem("codestream.env");

Dexie.debug = Boolean(codestreamEnv);

const dbName = `CodeStream${codestreamEnv ? `-${codestreamEnv}` : ""}`;
const db = new Dexie(dbName);
db.version(1).stores({
	streams: "id, teamId, repoId",
	posts: "id, teamId, streamId, creatorId",
	repos: "id, teamId",
	users: "id, *teamIds, email, username",
	teams: "id, *memberIds",
	markers: "id, streamId, postId",
	markerLocations: "[streamId+teamId+commitHash]"
});
db.version(2).stores({
	posts:
		"id, teamId, streamId, creatorId, [creatorId+text+teamId+streamId+commitHashWhenPosted+parentPostId], [creatorId+text+teamId+streamId+commitHashWhenPosted]"
});
db.version(3).stores({
	companies: "id",
	posts: "id, teamId, streamId, creatorId"
});

export default db;

export function upsert(db, tableName, changes) {
	return db.transaction("rw", tableName, () => {
		const table = db.table(tableName);
		const primaryKeySchema = table.schema.primKey;

		if (Array.isArray(changes)) return bulkUpsert(table, primaryKeySchema, changes);
		return singleUpsert(table, primaryKeySchema, changes);
	});
}

export function resolve({ id, ...object }, changes) {
	let result = { ...object };
	Object.keys(changes).forEach(change => {
		const operation = operations[change];
		if (operation) {
			operation(result, changes[change]);
			delete changes[change];
		} else {
			const nestedPropertyMatch = change.match(NESTED_PROPERTY_REGEX);
			if (nestedPropertyMatch) {
				const [, topField, subField] = nestedPropertyMatch;
				result[topField] = resolve(result[topField], { [subField]: changes[change] });
			} else result[change] = changes[change];
		}
	});
	return result;
}

export const bootstrapStore = store => {
	const { context } = store.getState();
	db
		.transaction(
			"r",
			db.companies,
			db.posts,
			db.users,
			db.streams,
			db.teams,
			db.repos,
			db.markers,
			db.markerLocations,
			() => {
				db.companies
					.limit(1000)
					.toArray(companies => store.dispatch(bootstrapCompanies(companies)));
				db.markers.limit(1000).toArray(markers => store.dispatch(bootstrapMarkers(markers)));
				db.markerLocations
					.limit(1000)
					.toArray(locations => store.dispatch(bootstrapMarkerLocations(locations)));
				if (context.currentTeamId) {
					db.users
						.where({ teamIds: context.currentTeamId })
						.toArray(users => store.dispatch(bootstrapUsers(users)));
					db.repos
						.where({ teamId: context.currentTeamId })
						.toArray(repos => store.dispatch(bootstrapRepos(repos)));
					db.teams.get(context.currentTeamId).then(team => store.dispatch(bootstrapTeams([team])));
					db.posts
						.where({ teamId: context.currentTeamId })
						.limit(1000)
						.reverse()
						.sortBy("createdAt", posts => store.dispatch(bootstrapPosts(posts)));
					db.streams
						.where({ teamId: context.currentTeamId })
						.toArray(streams => store.dispatch(bootstrapStreams(streams)));
				} else {
					db.users.limit(1000).toArray(users => store.dispatch(bootstrapUsers(users)));
					db.repos.limit(1000).toArray(repos => store.dispatch(bootstrapRepos(repos)));
					db.teams.limit(1000).toArray(teams => store.dispatch(bootstrapTeams(teams)));
					db.streams.limit(1000).toArray(streams => store.dispatch(bootstrapStreams(streams)));
					db.posts
						.limit(1000)
						.reverse()
						.sortBy("createdAt", posts => store.dispatch(bootstrapPosts(posts)));
				}
			}
		)
		.then(() => {
			store.dispatch({ type: "BOOTSTRAP_COMPLETE" });
		})
		.catch(error => {
			console.error(error);
			// TODO: wtf
		});
};

const bootstrapCompanies = payload => ({ type: "BOOTSTRAP_COMPANIES", payload });
const bootstrapUsers = payload => ({ type: "BOOTSTRAP_USERS", payload });
const bootstrapRepos = payload => ({ type: "BOOTSTRAP_REPOS", payload });
const bootstrapTeams = payload => ({ type: "BOOTSTRAP_TEAMS", payload });
const bootstrapPosts = payload => ({ type: "BOOTSTRAP_POSTS", payload });
const bootstrapStreams = payload => ({ type: "BOOTSTRAP_STREAMS", payload });
const bootstrapMarkers = payload => ({ type: "BOOTSTRAP_MARKERS", payload });
const bootstrapMarkerLocations = payload => ({ type: "BOOTSTRAP_MARKER_LOCATIONS", payload });

const bulkUpsert = (table, primaryKeySchema, changes) => {
	return Promise.all(changes.map(change => singleUpsert(table, primaryKeySchema, change)));
};

const singleUpsert = (table, primaryKeySchema, changes) => {
	let primaryKey;
	if (primaryKeySchema.compound) {
		primaryKey = primaryKeySchema.keyPath.reduce(
			(result, path) => ({ ...result, [path]: changes[path] }),
			{}
		);
		Object.freeze(primaryKey); // weirdly, calling update below attempts to modify this object
	} else primaryKey = changes[primaryKeySchema.keyPath];

	return table.get(primaryKey).then(async entity => {
		if (entity) {
			const updated = await table.update(primaryKey, resolve(entity, changes));
			// TODO?: only return an object if there is an update
		} else {
			await table.add(changes);
		}
		return table.get(primaryKey);
	});
};

const NESTED_PROPERTY_REGEX = /^(.+)\.(.+)$/;

const handle = (property, object, data, recurse, apply) => {
	const nestedPropertyMatch = property.match(NESTED_PROPERTY_REGEX);
	if (nestedPropertyMatch) {
		let [, topField, subField] = nestedPropertyMatch;
		if (typeof object[topField] === "object")
			recurse(object[topField], { [subField]: data[property] });
	} else apply();
};

const operations = {
	$set(object, data) {
		Object.keys(data).forEach(property => {
			handle(property, object, data, operations.$set, () => (object[property] = data[property]));
		});
	},
	$unset(object, data) {
		Object.keys(data).forEach(property => {
			handle(property, object, data, operations.$unset, () => (object[property] = undefined));
		});
	},
	$push(object, data) {
		Object.keys(data).forEach(property => {
			handle(property, object, data, operations.$push, () => {
				const value = object[property];
				if (Array.isArray(value)) value.push(data[property]);
			});
		});
	},
	$pull(object, data) {
		Object.keys(data).forEach(property => {
			handle(property, object, data, operations.$pull, () => {
				const value = object[property];
				if (Array.isArray(value)) object[property] = value.filter(it => it !== data[property]);
			});
		});
	},
	$addToSet(object, data) {
		Object.keys(data).forEach(property => {
			handle(property, object, data, operations.$addToSet, () => {
				let newValue = data[property];
				if (!Array.isArray(newValue)) newValue = [newValue];
				const currentValue = object[property];
				if (currentValue === undefined) object[property] = newValue;
				else if (Array.isArray(currentValue)) {
					newValue.forEach(value => {
						if (!currentValue.find(it => it === value)) currentValue.push(value);
					});
				}
			});
		});
	},
	$inc(object, data) {
		Object.keys(data).forEach(property => {
			handle(property, object, data, operations.$inc, () => {
				const value = object[property];
				if (value === undefined) object[property] = data[property];
				else if (Number.isInteger(value)) object[property] = value + data[property];
			});
		});
	}
};
