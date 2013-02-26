// routes/api.js
//
// The beating heart of a pumpin' good time
//
// Copyright 2011-2013, StatusNet Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

var databank = require("databank"),
    _ = require("underscore"),
    Step = require("step"),
    validator = require("validator"),
    path = require("path"),
    fs = require("fs"),
    mkdirp = require("mkdirp"),
    check = validator.check,
    sanitize = validator.sanitize,
    FilteredStream = require("../lib/filteredstream").FilteredStream,
    filters = require("../lib/filters"),
    recipientsOnly = filters.recipientsOnly,
    publicOnly = filters.publicOnly,
    objectRecipientsOnly = filters.objectRecipientsOnly,
    objectPublicOnly = filters.objectPublicOnly,
    idRecipientsOnly = filters.idRecipientsOnly,
    idPublicOnly = filters.idPublicOnly,
    HTTPError = require("../lib/httperror").HTTPError,
    Stamper = require("../lib/stamper").Stamper,
    Mailer = require("../lib/mailer"),
    Scrubber = require("../lib/scrubber"),
    ActivitySpam = require("../lib/activityspam"),
    Activity = require("../lib/model/activity").Activity,
    AppError = require("../lib/model/activity").AppError,
    Collection = require("../lib/model/collection").Collection,
    ActivityObject = require("../lib/model/activityobject").ActivityObject,
    Confirmation = require("../lib/model/confirmation").Confirmation,
    User = require("../lib/model/user").User,
    Person = require("../lib/model/person").Person,
    Edge = require("../lib/model/edge").Edge,
    Favorite = require("../lib/model/favorite").Favorite,
    stream = require("../lib/model/stream"),
    Stream = stream.Stream,
    NotInStreamError = stream.NotInStreamError,
    URLMaker = require("../lib/urlmaker").URLMaker,
    Distributor = require("../lib/distributor"),
    mw = require("../lib/middleware"),
    authc = require("../lib/authc"),
    omw = require("../lib/objectmiddleware"),
    randomString = require("../lib/randomstring").randomString,
    finishers = require("../lib/finishers"),
    mm = require("../lib/mimemap"),
    saveUpload = require("../lib/saveupload").saveUpload,
    reqUser = mw.reqUser,
    reqGenerator = mw.reqGenerator,
    sameUser = mw.sameUser,
    clientAuth = authc.clientAuth,
    userAuth = authc.userAuth,
    remoteUserAuth = authc.remoteUserAuth,
    remoteWriteOAuth = authc.remoteWriteOAuth,
    noneWriteOAuth = authc.noneWriteOAuth,
    userWriteOAuth = authc.userWriteOAuth,
    userReadAuth = authc.userReadAuth,
    anyReadAuth = authc.anyReadAuth,
    setPrincipal = authc.setPrincipal,
    fileContent = mw.fileContent,
    requestObject = omw.requestObject,
    authorOnly = omw.authorOnly,
    authorOrRecipient = omw.authorOrRecipient,
    NoSuchThingError = databank.NoSuchThingError,
    AlreadyExistsError = databank.AlreadyExistsError,
    NoSuchItemError = databank.NoSuchItemError,
    addFollowedFinisher = finishers.addFollowedFinisher,
    addFollowed = finishers.addFollowed,
    addLikedFinisher = finishers.addLikedFinisher,
    addLiked = finishers.addLiked,
    addLikersFinisher = finishers.addLikersFinisher,
    addLikers = finishers.addLikers,
    addSharedFinisher = finishers.addSharedFinisher,
    addShared = finishers.addShared,
    firstFewRepliesFinisher = finishers.firstFewRepliesFinisher,
    firstFewReplies = finishers.firstFewReplies,
    firstFewSharesFinisher = finishers.firstFewSharesFinisher,
    firstFewShares = finishers.firstFewShares,
    doFinishers = finishers.doFinishers,
    typeToClass = mm.typeToClass,
    typeToExt = mm.typeToExt,
    extToType = mm.extToType,
    DEFAULT_ITEMS = 20,
    DEFAULT_ACTIVITIES = DEFAULT_ITEMS,
    DEFAULT_FAVORITES = DEFAULT_ITEMS,
    DEFAULT_LIKES = DEFAULT_ITEMS,
    DEFAULT_REPLIES = DEFAULT_ITEMS,
    DEFAULT_SHARES = DEFAULT_ITEMS,
    DEFAULT_FOLLOWERS = DEFAULT_ITEMS,
    DEFAULT_FOLLOWING = DEFAULT_ITEMS,
    DEFAULT_MEMBERS = DEFAULT_ITEMS,
    DEFAULT_USERS = DEFAULT_ITEMS,
    DEFAULT_LISTS = DEFAULT_ITEMS,
    DEFAULT_UPLOADS = DEFAULT_ITEMS,
    MAX_ITEMS = DEFAULT_ITEMS * 10,
    MAX_ACTIVITIES = MAX_ITEMS,
    MAX_FAVORITES = MAX_ITEMS,
    MAX_LIKES = MAX_ITEMS,
    MAX_REPLIES = MAX_ITEMS,
    MAX_SHARES = MAX_ITEMS,
    MAX_FOLLOWERS = MAX_ITEMS,
    MAX_FOLLOWING = MAX_ITEMS,
    MAX_MEMBERS = MAX_ITEMS,
    MAX_USERS = MAX_ITEMS,
    MAX_LISTS = MAX_ITEMS,
    MAX_UPLOADS = MAX_ITEMS;

// Initialize the app controller

var addRoutes = function(app) {

    var smw = (app.session) ? [app.session] : [];

    // Users
    app.get("/api/user/:nickname", smw, anyReadAuth, reqUser, getUser);
    app.put("/api/user/:nickname", userWriteOAuth, reqUser, sameUser, putUser);
    app.del("/api/user/:nickname", userWriteOAuth, reqUser, sameUser, delUser);

    app.get("/api/user/:nickname/profile", smw, anyReadAuth, reqUser, personType, getObject);
    app.put("/api/user/:nickname/profile", userWriteOAuth, reqUser, sameUser, personType, reqGenerator, putObject);

    // Feeds

    app.get("/api/user/:nickname/feed", smw, anyReadAuth, reqUser, userStream);
    app.post("/api/user/:nickname/feed", userWriteOAuth, reqUser, sameUser, reqGenerator, postActivity);

    app.get("/api/user/:nickname/feed/major", smw, anyReadAuth, reqUser, userMajorStream);
    app.get("/api/user/:nickname/feed/minor", smw, anyReadAuth, reqUser, userMinorStream);

    app.post("/api/user/:nickname/feed/major", userWriteOAuth, reqUser, sameUser, isMajor, reqGenerator, postActivity);
    app.post("/api/user/:nickname/feed/minor", userWriteOAuth, reqUser, sameUser, isMinor, reqGenerator, postActivity);

    // Inboxen

    app.get("/api/user/:nickname/inbox", smw, userReadAuth, reqUser, sameUser, userInbox);
    app.post("/api/user/:nickname/inbox", remoteWriteOAuth, reqUser, postToInbox);

    app.get("/api/user/:nickname/inbox/major", smw, userReadAuth, reqUser, sameUser, userMajorInbox);
    app.get("/api/user/:nickname/inbox/minor", smw, userReadAuth, reqUser, sameUser, userMinorInbox);
    app.get("/api/user/:nickname/inbox/direct", smw, userReadAuth, reqUser, sameUser, userDirectInbox);
    app.get("/api/user/:nickname/inbox/direct/major", smw, userReadAuth, reqUser, sameUser, userMajorDirectInbox);
    app.get("/api/user/:nickname/inbox/direct/minor", smw, userReadAuth, reqUser, sameUser, userMinorDirectInbox);

    // Followers

    app.get("/api/user/:nickname/followers", smw, anyReadAuth, reqUser, userFollowers);

    // Following

    app.get("/api/user/:nickname/following", smw, anyReadAuth, reqUser, userFollowing);
    app.post("/api/user/:nickname/following", userWriteOAuth, reqUser, sameUser, reqGenerator, newFollow);

    // Favorites

    app.get("/api/user/:nickname/favorites", smw, anyReadAuth, reqUser, userFavorites);
    app.post("/api/user/:nickname/favorites", userWriteOAuth, reqUser, sameUser, reqGenerator, newFavorite);

    // Lists

    app.get("/api/user/:nickname/lists/:type", smw, anyReadAuth, reqUser, userLists);

    if (app.config.uploaddir) {

        // Uploads

        app.get("/api/user/:nickname/uploads", smw, userReadAuth, reqUser, sameUser, userUploads);
        app.post("/api/user/:nickname/uploads", userWriteOAuth, reqUser, sameUser, fileContent, newUpload);
    }
    
    // Activities

    app.get("/api/activity/:uuid", smw, anyReadAuth, reqActivity, actorOrRecipient, getActivity);
    app.put("/api/activity/:uuid", userWriteOAuth, reqActivity, actorOnly, putActivity);
    app.del("/api/activity/:uuid", userWriteOAuth, reqActivity, actorOnly, delActivity);

    // Other objects

    app.get("/api/:type/:uuid", smw, anyReadAuth, requestObject, authorOrRecipient, getObject);
    app.put("/api/:type/:uuid", userWriteOAuth, requestObject, authorOnly, reqGenerator, putObject);
    app.del("/api/:type/:uuid", userWriteOAuth, requestObject, authorOnly, reqGenerator, deleteObject);

    app.get("/api/:type/:uuid/likes", smw, anyReadAuth, requestObject, authorOrRecipient, objectLikes);
    app.get("/api/:type/:uuid/replies", smw, anyReadAuth, requestObject, authorOrRecipient, objectReplies);
    app.get("/api/:type/:uuid/shares", smw, anyReadAuth, requestObject, authorOrRecipient, objectShares);

    // Global user list

    app.get("/api/users", smw, anyReadAuth, listUsers);
    app.post("/api/users", noneWriteOAuth, reqGenerator, createUser);

    // Collection members

    app.get("/api/collection/:uuid/members", smw, anyReadAuth, requestCollection, authorOrRecipient, collectionMembers);
    app.post("/api/collection/:uuid/members", userWriteOAuth, requestCollection, authorOnly, reqGenerator, newMember);

    // Info about yourself

    app.get("/api/whoami", smw, userReadAuth, whoami);
};

// XXX: use a common function instead of faking up params

var requestCollection = function(req, res, next) {
    req.params.type = "collection";
    requestObject(req, res, next);
};

var personType = function(req, res, next) {
    req.type = "person";
    next();
};

var isMajor = function(req, res, next) {
    var props = Scrubber.scrubActivity(req.body),
        activity = new Activity(props);

    if (activity.isMajor()) {
        next();
    } else {
        next(new HTTPError("Only major activities to this feed.", 400));
    }
};

var isMinor = function(req, res, next) {
    var props = Scrubber.scrubActivity(req.body),
        activity = new Activity(props);

    if (!activity.isMajor()) {
        next();
    } else {
        next(new HTTPError("Only minor activities to this feed.", 400));
    }
};

var userOnly = function(req, res, next) {
    var person = req.person,
        principal = req.principal;

    if (person && principal && person.id === principal.id && principal.objectType === "person") { 
        next();
    } else {
        next(new HTTPError("Only the user can modify this profile.", 403));
    }
};

var actorOnly = function(req, res, next) {
    var act = req.activity;

    if (act && act.actor && act.actor.id == req.principal.id) {
        next();
    } else {
        next(new HTTPError("Only the actor can modify this object.", 403));
    }
};

var actorOrRecipient = function(req, res, next) {

    var act = req.activity,
        person = req.principal;

    if (act && act.actor && person && act.actor.id == person.id) {
        next();
    } else {
        act.checkRecipient(person, function(err, isRecipient) {
            if (err) {
                next(err);
            } else if (!isRecipient) {
                next(new HTTPError("Only the actor and recipients can view this activity.", 403));
            } else {
                next();
            }
        });
    }
};

var getObject = function(req, res, next) {
    
    var type = req.type,
        obj = req[type],
        profile = req.principal;

    Step(
        function() {
            obj.expandFeeds(this);
        },
        function(err) {
            if (err) throw err;
            addLiked(profile, [obj], this.parallel());
            addLikers(profile, [obj], this.parallel());
            addShared(profile, [obj], this.parallel());
            firstFewReplies(profile, [obj], this.parallel());
            firstFewShares(profile, [obj], this.parallel());
            if (obj.isFollowable()) {
                addFollowed(profile, [obj], this.parallel());
            }
        },
        function(err) {
            if (err) {
                next(err);
            } else {
                obj.sanitize();
                res.json(obj);
            }
        }
    );
};

var putObject = function(req, res, next) {

    var type = req.type,
        obj = req[type],
        updates = Scrubber.scrubObject(req.body),
        act = new Activity({
            actor: req.principal,
            generator: req.generator,
            verb: "update",
            object: _(obj).extend(updates)
        });

    Step(
        function() {
            newActivity(act, req.principalUser, this);
        },
        function(err, act) {
            var d;
            if (err) {
                next(err);
            } else {
                act.object.sanitize();
                res.json(act.object);
                d = new Distributor(act);
                d.distribute(function(err) {});
            }
        }
    );
};

var deleteObject = function(req, res, next) {

    var type = req.type,
        obj = req[type],
        act = new Activity({
            actor: req.principal,
            verb: "delete",
            generator: req.generator,
            object: obj
        });

    Step(
        function() {
            newActivity(act, req.principalUser, this);
        },
        function(err, act) {
            var d;
            if (err) {
                next(err);
            } else {
                res.json("Deleted");
                d = new Distributor(act);
                d.distribute(function(err) {});
            }
        }
    );
};

var objectLikes = function(req, res, next) {

    var type = req.type,
        obj = req[type];

    var collection = {
        displayName: "People who like " + obj.displayName,
        id: URLMaker.makeURL("api/" + type + "/" + obj._uuid + "/likes"),
        items: []
    };

    var args;

    try {
        args = streamArgs(req, DEFAULT_LIKES, MAX_LIKES);
    } catch (e) {
        next(e);
        return;
    }

    Step(
        function() {
            obj.favoritersCount(this);
        },
        function(err, count) {
            if (err) {
                if (err.name == "NoSuchThingError") {
                    collection.totalItems = 0;
                    res.json(collection);
                } else {
                    throw err;
                }
            }
            collection.totalItems = count;
            obj.getFavoriters(args.start, args.end, this);
        },
        function(err, likers) {
            if (err) {
                next(err);
            } else {
                collection.items = likers;
                res.json(collection);
            }
        }
    );
};

var objectReplies = function(req, res, next) {

    var type = req.type,
        obj = req[type];

    var collection = {
        displayName: "Replies to " + ((obj.displayName) ? obj.displayName : obj.id),
        id: URLMaker.makeURL("api/" + type + "/" + obj._uuid + "/replies"),
        items: []
    };

    var args;

    try {
        args = streamArgs(req, DEFAULT_REPLIES, MAX_REPLIES);
    } catch (e) {
        next(e);
        return;
    }

    Step(
        function() {
            obj.getRepliesStream(this);
        },
        function(err, str) {
            var filtered;
            if (err) throw err;
            if (!req.principal) {
                // XXX: keep a separate stream instead of filtering
                filtered = new FilteredStream(str, objectPublicOnly);
            } else {
                filtered = new FilteredStream(str, objectRecipientsOnly(req.principal));
            }
            filtered.count(this.parallel());
            filtered.getObjects(args.start, args.end, this.parallel());
        },
        function(err, count, refs) {
            var group = this.group();
            if (err) throw err;
            collection.totalItems = count;
            _.each(refs, function(ref) {
                ActivityObject.getObject(ref.objectType, ref.id, group());
            });
        },
        function(err, objs) {
            if (err) {
                next(err);
            } else {
                _.each(objs, function(obj) {
                    obj.sanitize();
                    delete obj.inReplyTo;
                });
                collection.items = objs;
                res.json(collection);
            }
        }
    );
};

// Feed of actors (usually persons) who have shared the object
// It's stored as a stream, so we get those

var objectShares = function(req, res, next) {

    var type = req.type,
        obj = req[type];

    var collection = {
        displayName: "Shares of " + ((obj.displayName) ? obj.displayName : obj.id),
        id: URLMaker.makeURL("api/" + type + "/" + obj._uuid + "/shares"),
        items: []
    };

    var args;

    try {
        args = streamArgs(req, DEFAULT_SHARES, MAX_SHARES);
    } catch (e) {
        next(e);
        return;
    }

    Step(
        function() {
            obj.getSharesStream(this);
        },
        function(err, str) {
            var filtered;
            if (err) throw err;
            str.count(this.parallel());
            str.getObjects(args.start, args.end, this.parallel());
        },
        function(err, count, refs) {
            var group = this.group();
            if (err) throw err;
            collection.totalItems = count;
            _.each(refs, function(ref) {
                ActivityObject.getObject(ref.objectType, ref.id, group());
            });
        },
        function(err, objs) {
            if (err) {
                next(err);
            } else {
                _.each(objs, function(obj) {
                    obj.sanitize();
                });
                collection.items = objs;
                res.json(collection);
            }
        }
    );
};

var getUser = function(req, res, next) {

    Step(
        function() {
            req.user.profile.expandFeeds(this);
        },
        function(err) {
            if (err) throw err;
            if (!req.principal) {
                // skip
                this(null);
            } else if (req.principal.id == req.user.profile.id) {
                // same user
                req.user.profile.pump_io = {
                    followed: false
                };
                // skip
                this(null);
            } else {
                addFollowed(req.principal, [req.user.profile], this);
            }
        },
        function(err) {
            if (err) next(err);
            // If no user, or different user, hide email
            if (!req.principal || (req.principal.id != req.user.profile.id)) {
                delete req.user.email;
            }
            req.user.sanitize();
            res.json(req.user);
        }
    );
};

var putUser = function(req, res, next) {

    var newUser = req.body;

    req.user.update(newUser, function(err, saved) {
        if (err) {
            next(err);
        } else {
            saved.sanitize();
            res.json(saved);
        }
    });
};

var delUser = function(req, res, next) {

    var user = req.user;

    Step(
        function() {
            user.del(this);
        },
        function(err) {
            if (err) throw err;
            usersStream(this);
        },
        function(err, str) {
            if (err) throw err;
            str.remove(user.nickname, this);
        },
        function(err) {
            if (err) {
                next(err);
            } else {
                res.json("Deleted.");
            }
        }
    );
};

var reqActivity = function(req, res, next) {
    var act = null,
        uuid = req.params.uuid;
    Activity.search({"_uuid": uuid}, function(err, results) {
        if (err) {
            next(err);
        } else if (results.length === 0) { // not found
            next(new HTTPError("Can't find an activity with id " + uuid, 404));
        } else if (results.length > 1) {
            next(new HTTPError("Too many activities with ID = " + req.params.uuid, 500));
        } else {
            act = results[0];
            if (act.hasOwnProperty("deleted")) {
                next(new HTTPError("Deleted", 410));
            } else {
                act.expand(function(err) {
                    if (err) {
                        next(err);
                    } else {
                        req.activity = act;
                        next();
                    }
                });
            }
        }
    });
};

var getActivity = function(req, res, next) {
    var principal = req.principal,
        act = req.activity;

    act.sanitize(principal);

    res.json(act);
};

var putActivity = function(req, res, next) {
    var update = Scrubber.scrubActivity(req.body);

    req.activity.update(update, function(err, result) {
        if (err) {
            next(err);
        } else {
            result.sanitize(req.principal);
            res.json(result);
        }
    });
};

var delActivity = function(req, res, next) {
    var act = req.activity;
    Step(
        function() {
            act.efface(this);
        },
        function(err) {
            if (err) {
                next(err);
            } else {
                res.json("Deleted");
            }
        }
    );
};

// Get the stream of all users

var usersStream = function(callback) {
    
    Step(
        function() {
            Stream.get("user:all", this);
        },
        function(err, str) {
            if (err) {
                if (err.name == "NoSuchThingError") {
                    Stream.create({name: "user:all"}, this);
                } else {
                    throw err;
                }
            } else {
                callback(null, str);
            }
        },
        function(err, str) {
            if (err) {
                if (err.name == "AlreadyExistsError") {
                    Stream.get("user:all", callback);
                } else {
                    callback(err);
                }
            } else {
                callback(null, str);
            }
        }
    );
};

var thisService = function(app) {
    var Service = require("../lib/model/service").Service;
    return new Service({
        url: URLMaker.makeURL("/"),
        displayName: app.config.site || "pump.io"
    });
};

var createUser = function(req, res, next) {

    var user,
        props = req.body,
        email,
        registrationActivity = function(user, svc, callback) {
            var act = new Activity({
                actor: user.profile,
                verb: Activity.JOIN,
                object: svc,
                generator: req.generator
            });
            newActivity(act, user, callback);
        },
        welcomeActivity = function(user, svc, callback) {
            Step(
                function() {
                    res.render("welcome",
                               {page: {title: "Welcome"},
                                profile: user.profile,
                                service: svc,
                                layout: false},
                               this);
                },
                function(err, text) {
                    if (err) throw err;
                    var act = new Activity({
                        actor: svc,
                        verb: Activity.POST,
                        to: [user.profile],
                        object: {
                            objectType: ActivityObject.NOTE,
                            displayName: "Welcome to " + svc.displayName,
                            content: text
                        }
                    });
                    initActivity(act, this);
                },
                function(err, act) {
                    if (err) {
                        callback(err, null);
                    } else {
                        callback(null, act);
                    }
                }
            );
        },
        sendConfirmationEmail = function(user, email, callback) {
            Step(
                function() {
                    Confirmation.create({nickname: user.nickname,
                                         email: email},
                                        this);
                },
                function(err, confirmation) {
                    var confirmationURL;
                    if (err) throw err;
                    confirmationURL = URLMaker.makeURL("/main/confirm/" + confirmation.code);
                    res.render("confirmation-email-html",
                               {principal: user.profile,
                                principalUser: user,
                                confirmation: confirmation,
                                confirmationURL: confirmationURL,
                                layout: false},
                               this.parallel());
                    res.render("confirmation-email-text",
                               {principal: user.profile,
                                principalUser: user,
                                confirmation: confirmation,
                                confirmationURL: confirmationURL,
                                layout: false},
                               this.parallel());
                },
                function(err, html, text) {
                    if (err) throw err;
                    Mailer.sendEmail({to: email,
                                      subject: "Confirm your email address for " + req.app.config.site,
                                      text: text,
                                      attachment: {data: html,
                                                   type: "text/html",
                                                   alternative: true}},
                                     this);
                },
                function(err, message) {
                    callback(err);
                }
            );
        },
        defaultLists = function(user, callback) {
            Step(
                function(err, str) {
                    var lists = ["Friends", "Family", "Acquaintances", "Coworkers"],
                        group = this.group();

                    if (err) throw err;

                    _.each(lists, function(list) {
                        var act = new Activity({
                            verb: Activity.CREATE,
                            to: [{objectType: ActivityObject.COLLECTION,
                                  id: user.profile.followers.url}],
                            object: {
                                objectType: ActivityObject.COLLECTION,
                                displayName: list,
                                objectTypes: ["person"]
                            }
                        });
                        newActivity(act, user, group());
                    });
                },
                callback
            );
        };

    if (req.app.config.disableRegistration) {
        next(new HTTPError("No registration allowed.", 403));
        return;
    }

    // Email validation

    if (req.app.config.requireEmail) {
        if (!_.has(props, "email") ||
            !_.isString(props.email) ||
            props.email.length === 0) {
            next(new HTTPError("No email address", 400));
            return;
        } else {
            try {
                check(props.email).isEmail();
                email = props.email;
                delete props.email;
            } catch(e) {
                next(new HTTPError(e.message, 400));
                return;
            }
        }
    }

    Step(
        function() {
            User.create(props, this);
        },
        function(err, value) {
            if (err) {
                // Try to be more specific
                if (err instanceof User.BadPasswordError) {
                    throw new HTTPError(err.message, 400);
                } else if (err instanceof User.BadNicknameError) {
                    throw new HTTPError(err.message, 400);
                } else if (err.name == "AlreadyExistsError") {
                    throw new HTTPError(err.message, 409); // conflict
                } else {
                    throw err;
                }
            }
            user = value;
            usersStream(this);
        },
        function(err, str) {
            if (err) throw err;
            str.deliver(user.nickname, this);
        },
        function(err) {
            if (err) throw err;
            user.expand(this);
        },
        function(err) {
            if (err) throw err;
            if (req.app.config.requireEmail) {
                sendConfirmationEmail(user, email, this);
            } else {
                // skip if we don't require email
                this(null);
            }
        },
        function(err) {
            var svc;
            if (err) throw err;
            svc = thisService(req.app);
            registrationActivity(user, svc, this.parallel());
            welcomeActivity(user, svc, this.parallel());
            defaultLists(user, this.parallel());
        },
        function(err, reg, welcome, lists) {
            var rd, wd, group = this.group();
            if (err) throw err;
            rd = new Distributor(reg);
            rd.distribute(group());
            wd = new Distributor(welcome);
            wd.distribute(group());
            _.each(lists, function(list) {
                var d = new Distributor(list);
                d.distribute(group());
            });
        },
        function(err) {
            if (err) throw err;
            req.app.provider.newTokenPair(req.client, user, this);
        },
        function(err, pair) {
            if (err) {
                next(err);
            } else {
                // Hide the password for output
                user.sanitize();
                user.token = pair.access_token;
                user.secret = pair.token_secret;
                // If called as /main/register; see ./web.js
                // XXX: Bad hack
                if (req.session) {
		    setPrincipal(req.session, user.profile, function(err) {
				     if (err) {
					 next(err);
				     } else {
					 res.json(user);
				     }
				 });
                } else {
                    res.json(user);
		}
            }
        }
    );
};

var listUsers = function(req, res, next) {

    var url = URLMaker.makeURL("api/users"),
        collection = {
            displayName: "Users of this service",
            id: url,
            objectTypes: ["user"],
            links: {
                first: {
                    href: url
                },
                self: {
                    href: url
                }
            }
        };

    var args, str;

    try {
        args = streamArgs(req, DEFAULT_USERS, MAX_USERS);
    } catch (e) {
        next(e);
        return;
    }

    Step(
        function() {
            usersStream(this);
        },
        function(err, result) {
            if (err) throw err;
            str = result;
            str.count(this);
        },
        function(err, totalUsers) {
            if (err) throw err;
            collection.totalItems = totalUsers;
            if (totalUsers === 0) {
                collection.items = [];
                res.json(collection);
                return;
            } else {
                if (_(args).has("before")) {
                    str.getIDsGreaterThan(args.before, args.count, this);
                } else if (_(args).has("since")) {
                    str.getIDsLessThan(args.since, args.count, this);
                } else {
                    str.getIDs(args.start, args.end, this);
                }
            }
        },
        function(err, userIds) {
            if (err) throw err;
            User.readArray(userIds, this);
        },
        function(err, users) {
            var i;
            if (err) throw err;

            _.each(users, function(user) {
                user.sanitize();
                if (!req.principal || req.principal.id != user.profile.id) {
                    delete user.email;
                }
            });

            collection.items = users;

            if (users.length > 0) {
                collection.links.prev = {
                    href: url + "?since=" + encodeURIComponent(users[0].nickname)
                };
                if ((_(args).has("start") && args.start + users.length < collection.totalItems) ||
                    (_(args).has("before") && users.length >= args.count) ||
                    (_(args).has("since"))) {
                    collection.links.next = {
                        href: url + "?before=" + encodeURIComponent(users[users.length-1].nickname)
                    };
                }
            }

            res.json(collection);
        }
    );
};

var postActivity = function(req, res, next) {

    var props = Scrubber.scrubActivity(req.body),
        activity = new Activity(props);

    // Add a default actor

    if (!_(activity).has("actor")) {
        activity.actor = req.user.profile;
    }

    // If the actor is incorrect, error

    if (activity.actor.id !== req.user.profile.id) {
        next(new HTTPError("Invalid actor", 400));
        return;
    }

    // XXX: we overwrite anything here

    activity.generator = req.generator;

    // Default verb

    if (!_(activity).has("verb") || _(activity.verb).isNull()) {
        activity.verb = "post";
    }
    
    Step(
        function() {
            newActivity(activity, req.user, this);
        },
        function(err, activity) {
            var d;
            if (err) {
                next(err);
            } else {
                activity.sanitize(req.principal);
                // ...then show (possibly modified) results.
                res.json(activity);
                // ...then distribute.
                d = new Distributor(activity);
                d.distribute(function(err) {});
            }
        }
    );
};

var postToInbox = function(req, res, next) {

    var props = Scrubber.scrubActivity(req.body),
        activity = new Activity(props),
        user = req.user;

    // Check for actor

    if (!_(activity).has("actor")) {
        next(new HTTPError("Invalid actor", 400));
    }

    // We have slightly looser rules for hostnames

    if (req.client.webfinger) {
        if (ActivityObject.canonicalID(activity.actor.id) != ActivityObject.canonicalID(req.principal.id)) {
            next(new HTTPError("Actor is invalid since " + activity.actor.id + " is not " + req.principal.id, 400));
            return;
        }
    } else if (req.client.hostname) {
        if (ActivityObject.canonicalID(activity.actor.id) != "https://"+req.client.hostname + "/" &&
            ActivityObject.canonicalID(activity.actor.id) != "http://"+req.client.hostname + "/") {
            next(new HTTPError("Actor is invalid since " + activity.actor.id + " is not " + req.principal.id, 400));
            return;
        }
    }

    // Default verb

    if (!_(activity).has("verb") || _(activity.verb).isNull()) {
        activity.verb = "post";
    }

    // Add a received timestamp

    activity.received = Stamper.stamp();

    // TODO: return a 202 Accepted here?

    Step(
        function() {
            // First, ensure recipients
            activity.ensureRecipients(this);
        },
        function(err) {
            if (err) throw err;
            // apply the activity
            activity.apply(null, this);
        },
        function(err) {
            if (err) {
                if (err.name == "AppError") {
                    throw new HTTPError(err.message, 400);
                } else if (err.name == "NoSuchThingError") {
                    throw new HTTPError(err.message, 400);
                } else if (err.name == "AlreadyExistsError") {
                    throw new HTTPError(err.message, 400);
                } else if (err.name == "NoSuchItemError") {
                    throw new HTTPError(err.message, 400);
                } else if (err.name == "NotInStreamError") {
                    throw new HTTPError(err.message, 400);
                } else {
                    throw err;
                }
            }
            // ...then persist...
            activity.save(this);
        },
        function(err, saved) {
            if (err) throw err;
            activity = saved;
            user.addToInbox(activity, this.parallel());
        },
        function(err) {
            if (err) {
                next(err);
            } else {
                activity.sanitize(req.principal);
                // ...then show (possibly modified) results.
                // XXX: don't distribute
                res.json(activity);
            }
        }
    );
};

var initActivity = function(activity, callback) {

    Step(
        function() {
            // First, ensure recipients
            activity.ensureRecipients(this);
        },
        function(err) {
            if (err) throw err;
            ActivitySpam.test(activity, this);
        },
        function(err, isSpam, probability) {
            if (err) throw err;
            if (isSpam) {
                // XXX: do some social trust metrics
                throw new HTTPError("Looks like spam", 400);
            }
            // apply the activity
            activity.apply(null, this);
        },
        function(err) {
            if (err) {
                if (err.name == "AppError") {
                    throw new HTTPError(err.message, 400);
                } else if (err.name == "NoSuchThingError") {
                    throw new HTTPError(err.message, 400);
                } else if (err.name == "AlreadyExistsError") {
                    throw new HTTPError(err.message, 400);
                } else if (err.name == "NoSuchItemError") {
                    throw new HTTPError(err.message, 400);
                } else if (err.name == "NotInStreamError") {
                    throw new HTTPError(err.message, 400);
                } else {
                    throw err;
                }
            }
            // ...then persist...
            activity.save(this);
        },
        function(err, saved) {
            if (err) {
                callback(err, null);
            } else {
                callback(null, activity);
            }
        }
    );
};

var newActivity = function(activity, user, callback) {

    if (!_(activity).has("actor")) {
        activity.actor = user.profile;
    }

    Step(
        function() {
            initActivity(activity, this);
        },
        function(err, saved) {
            if (err) throw err;
            activity = saved;
            user.addToOutbox(activity, this.parallel());
            user.addToInbox(activity, this.parallel());
        },
        function(err) {
            if (err) {
                callback(err, null);
            } else {
                callback(null, activity);
            }
        }
    );
};

var filteredFeedRoute = function(urlmaker, titlemaker, streammaker, finisher) {

    return function(req, res, next) {

        var url = urlmaker(req),
            collection = {
                author: req.user.profile,
                displayName: titlemaker(req),
                id: url,
                objectTypes: ["activity"],
                url: url,
                links: {
                    first: {
                        href: url
                    },
                    self: {
                        href: url
                    }
                },
                items: []
            };

        var args, str, ids;

        try {
            args = streamArgs(req, DEFAULT_ACTIVITIES, MAX_ACTIVITIES);
        } catch (e) {
            next(e);
            return;
        }

        Step(
            function() {
                streammaker(req, this);
            },
            function(err, outbox) {
                if (err) {
                    if (err.name == "NoSuchThingError") {
                        collection.totalItems = 0;
                        res.json(collection);
                    } else {
                        throw err;
                    }
                } else {
                    // Skip filtering if remote user == author
                    if (req.principal && req.principal.id == req.user.profile.id) {
                        str = outbox;
                    } else if (!req.principal) {
                        // XXX: keep a separate stream instead of filtering
                        str = new FilteredStream(outbox, publicOnly);
                    } else {
                        str = new FilteredStream(outbox, recipientsOnly(req.principal));
                    }

                    getStream(str, args, collection, req.principal, this);
                }
            },
            function(err) {
                if (err) throw err;
                if (finisher) {
                    finisher(req, collection, this);
                } else {
                    this(null);
                }
            },
            function(err) {
                if (err) {
                    next(err);
                } else {
                    collection.items.forEach(function(act) {
                        delete act.actor;
                    });
                    if (_.has(collection, "author")) {
                        collection.author.sanitize();
                    }
                    res.json(collection);
                }
            }
        );
    };
};


var majorFinishers = doFinishers([addLikedFinisher,
                                  firstFewRepliesFinisher,
                                  addLikersFinisher,
                                  addSharedFinisher,
                                  firstFewSharesFinisher]);

var userStream = filteredFeedRoute(
    function(req) {
        return URLMaker.makeURL("api/user/" + req.user.nickname + "/feed");
    },
    function(req) {
        return "Activities by " + (req.user.profile.displayName || req.user.nickname);
    },
    function(req, callback) {
        req.user.getOutboxStream(callback);
    }
);

var userMajorStream = filteredFeedRoute(
    function(req) {
        return URLMaker.makeURL("api/user/" + req.user.nickname + "/feed/major");
    },
    function(req) {
        return "Major activities by " + (req.user.profile.displayName || req.user.nickname);
    },
    function(req, callback) {
        req.user.getMajorOutboxStream(callback);
    },
    majorFinishers
);

var userMinorStream = filteredFeedRoute(
    function(req) {
        return URLMaker.makeURL("api/user/" + req.user.nickname + "/feed/minor");
    },
    function(req) {
        return "Minor activities by " + (req.user.profile.displayName || req.user.nickname);
    },
    function(req, callback) {
        req.user.getMinorOutboxStream(callback);
    }
);

var feedRoute = function(urlmaker, titlemaker, streamgetter, finisher) {

    return function(req, res, next) {

        var url = urlmaker(req),
            collection = {
                author: req.user.profile,
                displayName: titlemaker(req),
                id: url,
                objectTypes: ["activity"],
                url: url,
                links: {
                    first: {
                        href: url
                    },
                    self: {
                        href: url
                    }
                },
                items: []
            };

        var args, str;

        try {
            args = streamArgs(req, DEFAULT_ACTIVITIES, MAX_ACTIVITIES);
        } catch (e) {
            next(e);
            return;
        }

        Step(
            function() {
                streamgetter(req, this);
            },
            function(err, inbox) {
                if (err) {
                    if (err.name == "NoSuchThingError") {
                        collection.totalItems = 0;
                        if (_.has(collection, "author")) {
                            collection.author.sanitize();
                        }
                        res.json(collection);
                    } else {
                        throw err;
                    }
                } else {
                    getStream(inbox, args, collection, req.principal, this);
                }
            },
            function(err) {
                if (err) throw err;
                if (finisher) {
                    finisher(req, collection, this);
                } else {
                    this(null);
                }
            },
            function(err) {
                if (err) {
                    next(err);
                } else {
                    if (_.has(collection, "author")) {
                        collection.author.sanitize();
                    }
                    res.json(collection);
                }
            }
        );
    };
};

var userInbox = feedRoute(
    function(req) {
        return URLMaker.makeURL("api/user/" + req.user.nickname + "/inbox");
    },
    function(req) {
        return "Activities for " + (req.user.profile.displayName || req.user.nickname);
    },
    function(req, callback) {
        req.user.getInboxStream(callback);
    }
);

var userMajorInbox = feedRoute(
    function(req) {
        return URLMaker.makeURL("api/user/" + req.user.nickname + "/inbox/major");
    },
    function(req) {
        return "Major activities for " + (req.user.profile.displayName || req.user.nickname);
    },
    function(req, callback) {
        req.user.getMajorInboxStream(callback);
    },
    majorFinishers
);

var userMinorInbox = feedRoute(
    function(req) {
        return URLMaker.makeURL("api/user/" + req.user.nickname + "/inbox/minor");
    },
    function(req) {
        return "Minor activities for " + (req.user.profile.displayName || req.user.nickname);
    },
    function(req, callback) {
        req.user.getMinorInboxStream(callback);
    }
);

var userDirectInbox = feedRoute(
    function(req) {
        return URLMaker.makeURL("api/user/" + req.user.nickname + "/inbox/direct");
    },
    function(req) {
        return "Activities directly for " + (req.user.profile.displayName || req.user.nickname);
    },
    function(req, callback) {
        req.user.getDirectInboxStream(callback);
    }
);

var userMajorDirectInbox = feedRoute(
    function(req) {
        return URLMaker.makeURL("api/user/" + req.user.nickname + "/inbox/direct/major");
    },
    function(req) {
        return "Major activities directly for " + (req.user.profile.displayName || req.user.nickname);
    },
    function(req, callback) {
        req.user.getMajorDirectInboxStream(callback);
    },
    majorFinishers
);

var userMinorDirectInbox = feedRoute(
    function(req) {
        return URLMaker.makeURL("api/user/" + req.user.nickname + "/inbox/direct/minor");
    },
    function(req) {
        return "Minor activities directly for " + (req.user.profile.displayName || req.user.nickname);
    },
    function(req, callback) {
        req.user.getMinorDirectInboxStream(callback);
    }
);

var getStream = function(str, args, collection, principal, callback) {

    Step(
        function() {
            str.count(this);
        },
        function(err, totalItems) {
            if (err) throw err;
            collection.totalItems = totalItems;
            if (totalItems === 0) {
                callback(null);
                return;
            }
            if (_(args).has("before")) {
                str.getIDsGreaterThan(args.before, args.count, this);
            } else if (_(args).has("since")) {
                str.getIDsLessThan(args.since, args.count, this);
            } else {
                str.getIDs(args.start, args.end, this);
            }
        },
        function(err, ids) {
            if (err) {
                if (err.name == "NotInStreamError") {
                    throw new HTTPError(err.message, 400);
                } else {
                    throw err;
                }
            }
            Activity.readArray(ids, this);
        },
        function(err, activities) {
            if (err) {
                callback(err);
            } else {
                activities.forEach(function(act) {
                    act.sanitize(principal);
                });
                collection.items = activities;
                if (activities.length > 0) {
                    collection.links.prev = {
                        href: collection.url + "?since=" + encodeURIComponent(activities[0].id)
                    };
                    if ((_(args).has("start") && args.start + activities.length < collection.totalItems) ||
                        (_(args).has("before") && activities.length >= args.count) ||
                        (_(args).has("since"))) {
                        collection.links.next = {
                            href: collection.url + "?before=" + encodeURIComponent(activities[activities.length-1].id)
                        };
                    }
                }
                callback(null);
            }
        }
    );
};

var userFollowers = function(req, res, next) {

    var collection = {
        author: req.user.profile,
        displayName: "Followers for " + (req.user.profile.displayName || req.user.nickname),
        id: URLMaker.makeURL("api/user/" + req.user.nickname + "/followers"),
        objectTypes: ["person"],
        items: []
    };

    var args, str;

    try {
        args = streamArgs(req, DEFAULT_FOLLOWERS, MAX_FOLLOWERS);
    } catch (e) {
        next(e);
        return;
    }

    Step(
        function() {
            req.user.followersStream(this);
        },
        function(err, results) {
            if (err) throw err;
            str = results;
            str.count(this);
        },
        function(err, count) {
            if (err) {
                if (err.name == "NoSuchThingError") {
                    collection.totalItems = 0;
                    if (_.has(collection, "author")) {
                        collection.author.sanitize();
                    }
                    res.json(collection);
                } else {
                    throw err;
                }
            } else {
                collection.totalItems = count;
                // XXX: short-circuit for empty followers stream
                if (_(args).has("before")) {
                    str.getIDsGreaterThan(args.before, args.count, this);
                } else if (_(args).has("since")) {
                    str.getIDsLessThan(args.since, args.count, this);
                } else {
                    str.getIDs(args.start, args.end, this);
                }
            }
        },
        function(err, ids) {
            if (err) throw err;
            Person.readArray(ids, this);
        },
        function(err, people) {
            if (err) throw err;

            collection.items = people;

            if (!req.principal) {
                this(null);
            } else {
                addFollowed(req.principal, people, this);
            }
        },
        function(err) {

            var base = "api/user/" + req.user.nickname + "/followers";

            if (err) {

                next(err);

            } else {

                _.each(collection.items, function(person) {
                    person.sanitize();
                });

                collection.links = {
                    self: {
                        href: URLMaker.makeURL(base, {offset: args.start, count: args.count})
                    },
                    current: {
                        href: URLMaker.makeURL(base)
                    }
                };

                if (collection.items.length > 0)  {
                    collection.links.prev = {
                        href: URLMaker.makeURL(base, 
                                               {since: collection.items[0].id})
                    };
                    collection.links.next = {
                        href: URLMaker.makeURL(base, 
                                               {before: collection.items[collection.items.length - 1].id})
                    };
                }

                if (_.has(collection, "author")) {
                    collection.author.sanitize();
                }

                res.json(collection);
            }
        }
    );
};

var userFollowing = function(req, res, next) {

    var collection = {
        author: req.user.profile,
        displayName: "People that " + (req.user.profile.displayName || req.user.nickname) + " is following",
        id: URLMaker.makeURL("api/user/" + req.user.nickname + "/following"),
        objectTypes: ["person"],
        items: []
    };

    var args;

    try {
        args = streamArgs(req, DEFAULT_FOLLOWING, MAX_FOLLOWING);
    } catch (e) {
        next(e);
        return;
    }

    Step(
        function() {
            req.user.followingCount(this);
        },
        function(err, count) {
            if (err) {
                if (err.name == "NoSuchThingError") {
                    collection.totalItems = 0;
                    if (_.has(collection, "author")) {
                        collection.author.sanitize();
                    }
                    res.json(collection);
                } else {
                    throw err;
                }
            } else {
                collection.totalItems = count;
                req.user.followingStream(this);
            }
        },
        function(err, str) {
            if (err) throw err;
            if (_(args).has("before")) {
                str.getIDsGreaterThan(args.before, args.count, this);
            } else if (_(args).has("since")) {
                str.getIDsLessThan(args.since, args.count, this);
            } else {
                str.getIDs(args.start, args.end, this);
            }
        },
        function(err, ids) {
            if (err) throw err;
            Person.readArray(ids, this);
        },
        function(err, people) {
            if (err) throw err;

            collection.items = people;

            if (!req.principal) {
                // Same user; by definition, all are followed
                this(null);
            } else if (req.principal.id == req.user.profile.id) {
                // Same user; by definition, all are followed
                _.each(people, function(person) {
                    if (!_.has(person, "pump_io")) {
                        person.pump_io = {};
                    }
                    person.pump_io.followed = true;
                });
                this(null);
            } else {
                addFollowed(req.principal, people, this);
            }
        },
        function(err) {
            var base = "api/user/" + req.user.nickname + "/following";
            if (err) {
                next(err);
            } else {

                _.each(collection.items, function(person) {
                    person.sanitize();
                });

                collection.startIndex = args.start;
                collection.itemsPerPage = args.count;

                collection.links = {
                    self: {
                        href: URLMaker.makeURL(base, {offset: args.start, count: args.count})
                    },
                    current: {
                        href: URLMaker.makeURL(base)
                    }
                };

                if (collection.items.length > 0)  {
                    collection.links.prev = {
                        href: URLMaker.makeURL(base, 
                                               {since: collection.items[0].id})
                    };
                    collection.links.next = {
                        href: URLMaker.makeURL(base, 
                                               {before: collection.items[collection.items.length - 1].id})
                    };
                }

                if (_.has(collection, "author")) {
                    collection.author.sanitize();
                }
                res.json(collection);
            }
        }
    );
};

var newFollow = function(req, res, next) {
    var obj = Scrubber.scrubObject(req.body),
        act = new Activity({
            actor: req.user.profile,
            verb: "follow",
            object: obj,
            generator: req.generator
        });

    Step(
        function() {
            newActivity(act, req.user, this);
        },
        function(err, act) {
            var d;
            if (err) {
                next(err);
            } else {
                act.object.sanitize();
                res.json(act.object);
                d = new Distributor(act);
                d.distribute(function(err) {});
            }
        }
    );
};

var userFavorites = function(req, res, next) {
    var collection = {
        author: req.user.profile,
        displayName: "Things that " + (req.user.profile.displayName || req.user.nickname) + " has favorited",
        id: URLMaker.makeURL("api/user/" + req.user.nickname + "/favorites"),
        items: []
    },
        args,
        stream;

    try {
        args = streamArgs(req, DEFAULT_FAVORITES, MAX_FAVORITES);
    } catch (e) {
        next(e);
        return;
    }

    Step(
        function() {
            req.user.favoritesStream(this);
        },
        function(err, result) {
            var str;
            if (err) throw err;
            stream = result;
            stream.count(this);
        },
        function(err, cnt) {
            var str;
            if (err) throw err;
            collection.totalItems = cnt;
            if (cnt === 0) {
                if (_.has(collection, "author")) {
                    collection.author.sanitize();
                }
                res.json(collection);
                return;
            }
            if (req.principal && req.principal.id == req.user.profile.id) {
                // Same user, don't filter
                str = stream;
            } else if (!req.principal) {
                // Public user, filter
                str = new FilteredStream(stream, objectPublicOnly);
            } else {
                // Registered user, filter
                str = new FilteredStream(stream, objectRecipientsOnly(req.principal));
            }
            str.getObjects(args.start, args.end, this);
        },
        function(err, refs) {
            var group = this.group();
            if (err) throw err;
            _.each(refs, function(ref) {
                // XXX: expand?
                // XXX: expand feeds, too?
                ActivityObject.getObject(ref.objectType, ref.id, group());
            });
        },
        function(err, objects) {

            var group = this.group();

            if (err) throw err;

            collection.items = objects;

            _.each(objects, function(object) {
                object.expandFeeds(group());
            });
        },
        function(err) {

            var third,
                profile = req.principal;

            if (err) throw err;

            // Add the first few replies for each object

            firstFewReplies(profile, collection.items, this.parallel());

            // Add the first few replies for each object

            firstFewShares(profile, collection.items, this.parallel());

            // Add the first few "likers" for each object

            addLikers(profile, collection.items, this.parallel());

            // Add the shared flag for each object

            addShared(profile, collection.items, this.parallel());

            third = this.parallel();

            if (!req.principal) { 
                // No user, no liked
                third(null);
            } else if (req.principal.id == req.user.profile.id) {
                // Same user, all liked (by definition!)
                _.each(collection.items, function(object) {
                    object.liked = true;
                });
                third(null);
            } else {
                // Different user; check for likes
                addLiked(req.principal, collection.items, third);
            }
        },
        function(err) {
            if (err) {
                next(err);
            } else {
                _.each(collection.items, function(object) {
                    object.sanitize();
                });
                if (_.has(collection, "author")) {
                    collection.author.sanitize();
                }
                res.json(collection);
            }
        }
    );
};

var newFavorite = function(req, res, next) {
    var obj = Scrubber.scrubObject(req.body),
        act = new Activity({
            actor: req.user.profile,
            verb: "favorite",
            object: obj,
            generator: req.generator
        });

    Step(
        function() {
            newActivity(act, req.user, this);
        },
        function(err, act) {
            var d;
            if (err) {
                next(err);
            } else {
                act.object.sanitize();
                res.json(act.object);
                d = new Distributor(act);
                d.distribute(function(err) {});
            }
        }
    );
};

var userLists = function(req, res, next) {
    var type = req.params.type,
        profile = req.principal,
        url = URLMaker.makeURL("api/user/" + req.user.nickname + "/lists/" + type),
        collection = {
            author: req.user.profile,
            displayName: "Collections of " + type + "s for " + (req.user.profile.displayName || req.user.nickname),
            id: url,
            objectTypes: ["collection"],
            url: url,
            links: {
                first: {
                    href: url
                },
                self: {
                    href: url
                }
            },
            items: []
        };

    var args, lists, stream;

    try {
        args = streamArgs(req, DEFAULT_LISTS, MAX_LISTS);
    } catch (e) {
        next(e);
        return;
    }

    Step(
        function() {
            req.user.getLists(type, this);
        },
        function(err, result) {
            if (err) throw err;
            stream = result;
            stream.count(this);
        },
        function(err, totalItems) {
            var filtered;
            if (err) throw err;
            collection.totalItems = totalItems;
            if (totalItems === 0) {
                if (_.has(collection, "author")) {
                    collection.author.sanitize();
                }
                res.json(collection);
                return;
            }
            if (!profile) {
                filtered = new FilteredStream(stream, idPublicOnly(Collection.type));
            } else if (profile.id == req.user.profile.id) {
                filtered = stream;
            } else {
                filtered = new FilteredStream(stream, idRecipientsOnly(profile, Collection.type));
            }

            if (_(args).has("before")) {
                filtered.getIDsGreaterThan(args.before, args.count, this);
            } else if (_(args).has("since")) {
                filtered.getIDsLessThan(args.since, args.count, this);
            } else {
                filtered.getIDs(args.start, args.end, this);
            }
        },
        function(err, ids) {
            if (err) {
                if (err.name == "NotInStreamError") {
                    throw new HTTPError(err.message, 400);
                } else {
                    throw err;
                }
            }
            Collection.readArray(ids, this);
        },
        function(err, results) {
            var group = this.group();
            if (err) throw err;
            lists = results;
            _.each(lists, function(list) {
                list.expandFeeds(group());
            });
        },
        function(err) {
            if (err) {
                next(err);
            } else {
                _.each(lists, function(item) {
                    item.sanitize();
                });
                collection.items = lists;
                if (lists.length > 0) {
                    collection.links.prev = {
                        href: collection.url + "?since=" + encodeURIComponent(lists[0].id)
                    };
                    if ((_(args).has("start") && args.start + lists.length < collection.totalItems) ||
                        (_(args).has("before") && lists.length >= args.count) ||
                        (_(args).has("since"))) {
                        collection.links.next = {
                            href: collection.url + "?before=" + encodeURIComponent(lists[lists.length-1].id)
                        };
                    }
                }
                if (_.has(collection, "author")) {
                    collection.author.sanitize();
                }
                res.json(collection);
            }
        }
    );
};

var userUploads = function(req, res, next) {

    var url = URLMaker.makeURL("api/user/" + req.user.nickname + "/uploads"),
        collection = {
            author: req.user.profile,
            displayName: "Uploads by " + (req.user.profile.displayName || req.user.nickname),
            id: url,
            objectTypes: ["file", "image", "audio", "video"],
            url: url,
            links: {
                first: {
                    href: url
                },
                self: {
                    href: url
                }
            },
            items: []
        },
        args,
        uploads;

    try {
        args = streamArgs(req, DEFAULT_UPLOADS, MAX_UPLOADS);
    } catch (e) {
        next(e);
        return;
    }

    Step(
        function() {
            req.user.uploadsStream(this);
        },
        function(err, stream) {
            if (err) throw err;
            uploads = stream;
            uploads.count(this);
        },
        function(err, totalItems) {
            if (err) throw err;
            collection.totalItems = totalItems;
            if (totalItems === 0) {
                if (_.has(collection, "author")) {
                    collection.author.sanitize();
                }
                res.json(collection);
                return;
            }
            if (_(args).has("before")) {
                uploads.getObjectsGreaterThan(args.before, args.count, this);
            } else if (_(args).has("since")) {
                uploads.getObjectsLessThan(args.since, args.count, this);
            } else {
                uploads.getObjects(args.start, args.end, this);
            }
        },
        function(err, refs) {
            var group;
            if (err) {
                if (err.name == "NotInStreamError") {
                    throw new HTTPError(err.message, 400);
                } else {
                    throw err;
                }
            }
            group = this.group();
            _.each(refs, function(ref) {
                ActivityObject.getObject(ref.objectType, ref.id, group());
            });
        },
        function(err, objects) {
            if (err) {
                next(err);
            } else {
                _.each(objects, function(object) {
                    object.sanitize();
                });
                collection.items = objects;
                if (_.has(collection, "author")) {
                    collection.author.sanitize();
                }
                res.json(collection);
            }
        }
    );
};

var newUpload = function(req, res, next) {

    var user = req.principalUser,
        mimeType = req.uploadMimeType,
        fileName = req.uploadFile,
        uploadDir = req.app.config.uploaddir;

    Step(
        function() {
            saveUpload(user, mimeType, fileName, uploadDir, this);
        },
        function(err, obj) {
            if (err) {
                next(err);
            } else {
                obj.sanitize();
                res.json(obj);
            }
        }
    );
};

var collectionMembers = function(req, res, next) {

    var coll = req.collection,
        profile = req.principal, 
        base = "/api/collection/"+coll._uuid+"/members",
        url = URLMaker.makeURL(base),
        feed = {
            author: coll.author,
            displayName: "Members of " + (coll.displayName || "a collection") + " by " + coll.author.displayName,
            id: url,
            objectTypes: coll.objectTypes,
            links: {
                first: {
                    href: url
                }
            },
            items: []
        },
        args,
        str;

    try {
        args = streamArgs(req, DEFAULT_MEMBERS, MAX_MEMBERS);
    } catch (e) {
        next(e);
        return;
    }

    Step(
        function() {
            coll.getStream(this);
        },
        function(err, result) {
            var filtered, type;
            if (err) throw err;
            str = result;
            if (!profile) {
                filtered = new FilteredStream(str, objectPublicOnly);
            } else if (profile.id == coll.author.id) {
                // no filter
                filtered = str;
            } else {
                filtered = new FilteredStream(str, objectRecipientsOnly(profile));
            }
            filtered.count(this.parallel());
            type = (req.query.type) ? req.query.type :
                   (coll.objectTypes.length > 0) ? coll.objectTypes[0] :
                Person.type;
            if (_(args).has("before")) {
                filtered.getObjectsGreaterThan({id: args.before, objectType: type}, args.count, this.parallel());
            } else if (_(args).has("since")) {
                filtered.getObjectsLessThan({id: args.since, objectType: type}, args.count, this.parallel());
            } else {
                filtered.getObjects(args.start, args.end, this.parallel());
            }
        },
        function(err, count, refs) {
            var group;
            if (err) throw err;
            feed.totalItems = count;
            // XXX: short-circuit here if count === 0
            group = this.group();
            _.each(refs, function(ref) {
                ActivityObject.getObject(ref.objectType, ref.id, group());
            });
        },
        function(err, objects) {

            var third, followable;

            if (err) throw err;

            feed.items = objects;

            // Add the first few replies for each object

            firstFewReplies(profile, feed.items, this.parallel());

            // Add the first few shares for each object

            firstFewShares(profile, feed.items, this.parallel());

            // Add the first few "likers" for each object

            addLikers(profile, feed.items, this.parallel());

            third = this.parallel();

            if (!profile) { 
                // No user, no liked
                third(null);
            } else {
                // Different user; check for likes
                addLiked(profile, feed.items, third);
            }

            followable = _.filter(feed.items, function(obj) {
                return obj.isFollowable();
            });

            addFollowed(profile, followable, this.parallel());
        },
        function(err) {

            var nextParams, prevParams;

            if (err) {
                next(err);
                return;
            }

            _.each(feed.items, function(obj) {
                obj.sanitize();
            });

            feed.startIndex = args.start;
            feed.itemsPerPage = args.count;

            feed.links = {
                self: {
                    href: URLMaker.makeURL(base, {offset: args.start, count: args.count})
                },
                current: {
                    href: URLMaker.makeURL(base)
                }
            };

            if (feed.items.length > 0) {

                prevParams = {since: feed.items[0].id};

                if (!feed.objectTypes ||
                    feed.objectTypes.length != 1 ||
                    feed.items[0].objectType != feed.objectTypes[0]) {
                    prevParams.type = feed.items[0].objectType;
                }
                
                feed.links.prev = {
                    href: URLMaker.makeURL(base, prevParams)
                };

                nextParams = {before: feed.items[feed.items.length - 1].id};

                if (!feed.objectTypes ||
                    feed.objectTypes.length != 1 ||
                    feed.items[feed.items.length - 1].objectType != feed.objectTypes[0]) {
                    nextParams.type = feed.items[feed.items.length - 1].objectType;
                }
                
                feed.links.next = {
                    href: URLMaker.makeURL(base, nextParams)
                };
            }

            if (_.has(feed, "author")) {
                feed.author.sanitize();
            }

            res.json(feed);
        }
    );
};

var newMember = function(req, res, next) {

    var coll = req.collection,
        obj = Scrubber.scrubObject(req.body),
        act = new Activity({
            verb: "add",
            object: obj,
            target: coll,
            generator: req.generator
        });


    Step(
        function() {
            newActivity(act, req.principalUser, this);
        },
        function(err, act) {
            var d;
            if (err) {
                next(err);
            } else {
                act.object.sanitize();
                res.json(act.object);
                d = new Distributor(act);
                d.distribute(function(err) {});
            }
        }
    );
};

// Since most stream endpoints take the same arguments,
// consolidate validation and parsing here

var streamArgs = function(req, defaultCount, maxCount) {

    var args = {};

    try {
        if (_(maxCount).isUndefined()) {
            maxCount = 10 * defaultCount;
        }

        if (_(req.query).has("count")) {
            check(req.query.count, "Count must be between 0 and " + maxCount).isInt().min(0).max(maxCount);
            args.count = sanitize(req.query.count).toInt();
        } else {
            args.count = defaultCount;
        }

        // XXX: Check "before" and "since" for injection...?
        // XXX: Check "before" and "since" for URI...?

        if (_(req.query).has("before")) {
            check(req.query.before).notEmpty();
            args.before = sanitize(req.query.before).trim();
        }

        if (_(req.query).has("since")) {
            if (_(args).has("before")) {
                throw new Error("Can't have both 'before' and 'since' parameters");
            }
            check(req.query.since).notEmpty();
            args.since = sanitize(req.query.since).trim();
        }

        if (_(req.query).has("offset")) {
            if (_(args).has("before")) {
                throw new Error("Can't have both 'before' and 'offset' parameters");
            }
            if (_(args).has("since")) {
                throw new Error("Can't have both 'since' and 'offset' parameters");
            }
            check(req.query.offset, "Offset must be an integer greater than or equal to zero").isInt().min(0);
            args.start = sanitize(req.query.offset).toInt();
        }

        if (!_(req.query).has("offset") && !_(req.query).has("since") && !_(req.query).has("before")) {
            args.start = 0;
        }

        if (_(args).has("start")) {
            args.end = args.start + args.count;
        }

        return args;
    } catch (e) {
        throw new HTTPError(e.message, 400);
    }
};

var whoami = function(req, res, next) {
    res.redirect("/api/user/"+req.principalUser.nickname+"/profile", 302);
};

exports.addRoutes = addRoutes;
exports.createUser = createUser;
