(function () {

    var Kran = function() {
        this.components = []
        this.componentNames = {};

        this.systems = []
        this.systemNames = {};
        
        this.systemGroups = {}
        this.systemGroups.all = new SystemGroup()

        this.entityCollections = {}
    }

    // ***********************************************
    // Component
    //
    function Component(comp,world) {
        if (isFunc(comp) || typeof(comp) === "string") {
            this.value = comp
        } else if (comp === true || comp === undefined) {
            this.value = true
        } else {
            throw new TypeError("Argument " + comp + " is given but not a function or string")
        }
        this.world = world;
        this.collectionsRequieringComp = []
    }

    Kran.prototype.component = function() {
        if(arguments.length === 2){
            this.components.push(new Component(arguments[1],this));
            this.componentNames[arguments[0]] = this.components.length - 1;
            return this.components.length - 1;
        } else if (arguments.length === 1 ){
            this.components.push(new Component(arguments[0],this));
            if(typeof arguments[0] === "string"){
                this.componentNames[arguments[0]] = this.components.length - 1;
            }
            return this.components.length - 1;
        } else {
            throw new Error("Kran.component accepts either one or two arguments.");
        }              
    };

    function checkComponentExistence(comps, compId) {
        if (comps[compId] !== undefined) {
            return compId
        } else {
            throw new Error("Component " + compId + " does no exist")
        }
    }

    // ***********************************************
    // Entity collections
    //
    var EntityCollection = function(comps) {
        this.comps = comps;
        this.buffer = new Array(comps.length + 2);
        this.ents = new LinkedList();
        this.arrival = [];
        this.removal = [];
    }

    EntityCollection.prototype.callWithComps = function(ent, func, context, ev) {
        var offset = 0
        if (ev) this.buffer[offset++] = ev
        for (var i = 0; i < this.comps.length; i++) {
            // Boolean components are equal to their id
            if (ent.comps[this.comps[i]] !== this.comps[i]) {
                this.buffer[offset++] = ent.comps[this.comps[i]]
            }
        }
        this.buffer[offset] = ent
        func.apply(context||this, this.buffer)
    }

    EntityCollection.prototype.forEachWithComps = function(every, context, ev) {
        this.ents.forEach(function (ent) { // Call every
            this.callWithComps(ent, every, context, ev)
        }, this)
    }

    Kran.prototype.getEntityCollection = function(comps) {
        comps = wrapInArray(comps)
        var key = comps.slice(0).sort().toString()
        if (this.entityCollections[key] === undefined) {
            var newCol = this.entityCollections[key] = new EntityCollection(comps)

            // Mark components that are part of this collection
            comps.forEach(function (compId) {
                compId = getCompId(compId,this);
                checkComponentExistence(this.components, compId)
                this.components[compId].collectionsRequieringComp.push(newCol)
            }, this)
        }
        return this.entityCollections[key] 
    }

    Kran.prototype.getSystemEntities = function(idOrName){
        if(typeof idOrName === "number"){
            return this.systems[idOrName].collection;
        } else {
            return this.systems[this.systemNames[idOrName]].collection;
        }
    };

    Kran.prototype.forEachSystemEntity = function(f,idOrName){
        if(typeof idOrName === "number"){
            return this.systems[idOrName].collection.forEachWithComps(f,this);
        } else {
            return this.systems[this.systemNames[idOrName]].collection.forEachWithComps(f,this);
        }
    };

    Kran.prototype.mapSystemEntities = function(f,idOrName){
        var out = [];
        var that = this;
        this.forEachSystemEntity(function(){
            out.push(f.apply(that,Array.prototype.slice.call(arguments, 0, arguments.length)));
        },idOrName);
        return out;
    };

    Kran.prototype["delete"] = function(e){
        e.delete();
    };

    // ***********************************************
    // System
    //
    var SystemGroup = function () {
        this.members = []
    }

    SystemGroup.prototype.run = function() {
        this.members.forEach(function (member) {
            member.run();
        });
    };

    Kran.prototype.ensureComponentIdList = function(components){
        var cns = this.componentNames;
        console.log(cns);
        return components.map(function(comp){
            if(typeof comp === "number") return comp;
            if(typeof cns[comp] !== "undefined") return cns[comp];
            throw new Error("Error looking up component: "+comp);
        });
    };

    Kran.prototype.system = function(props) {
        var id = this.systems.length;
        if(props.name){
            this.systemNames[props.name] = id;
        }
        props.run = runSystem;

        if (props.components !== undefined) {
            props.components = this.ensureComponentIdList(props.components);
            props.collection = this.getEntityCollection(props.components);
            if (isFunc(props.arrival)) {
                props.collection.arrival.push(props.arrival);
            }
            if (isFunc(props.removal)) {
                props.collection.removal.push(props.removal);
            }
        }
        if (props.on) {
            props.on = wrapInArray(props.on)
            props.on.forEach(function (event) {
                window.addEventListener(event, props.run.bind(props))
            })
        } else {
            // Only systems not listening for events are put in the all group
            this.systemGroups.all.members.push(props)
        }
        if (props.group) {
            if (this.systemGroups[props.group] === undefined) {
                this.systemGroups[props.group] = new SystemGroup(props.group)
            }
            this.systemGroups[props.group].members.push(props)
        }
        this.systems.push(props)
        return id;
    };

    Kran.prototype.runSystem = function(idOrName){
        if(typeof idOrName === "number"){
            this.systems[idOrName].run();
        } else {
            this.systems[this.systemNames[idOrName]].run();
        }
    };

    Kran.prototype.run = function(group) {
        if(typeof group==="number"){
            this.systems[group].run();

        } else {
            // Assume a group is meant.
            this.systemGroups[group].members.forEach(function (member) {
                member.run();
            });
        }
    }

    var runSystem = function(ev) {
        if (this.collection !== undefined &&
            this.collection.ents.length === 0) {
            return
        }
        if (ev && ev instanceof CustomEvent) {
            ev = ev.detail
        }
        if (isFunc(this.pre)) this.pre(ev)
        if (isFunc(this.every)) {
            this.collection.forEachWithComps(this.every, this, ev)
        }
        if (isFunc(this.post)) this.post(ev)
    }

    // ***********************************************
    // Entity
    //
    var Entity = function(compBlueprints,world) {
        this.comps = new Array(compBlueprints.length)
        this.compBlueprints = compBlueprints
        this.belongsTo = new LinkedList();
        this.world = world;
    }

    Entity.prototype.add = function(compId, arg1, arg2, arg3, arg4, arg5, arg6, arg7) {
        compId = getCompId(compId,this.world);
        checkComponentExistence(this.compBlueprints, compId)
        if (this.comps[compId] !== undefined) throw new Error("The entity already has the component")
        var comp = this.compBlueprints[compId].value
        if (isFunc(comp)) {
            this.comps[compId] = new comp(arg1, arg2, arg3, arg4, arg5, arg6, arg7)
            this.comps[compId].id = compId
        } else if (typeof comp === "string") {
            var obj = { id: compId }
            obj[comp] = arg1
            this.comps[compId] = obj
        } else {
            this.comps[compId] = compId
        }
        this.compBlueprints[compId].collectionsRequieringComp.forEach(function (coll) {
            if (qualifiesForCollection(this, coll.comps)) {
                addEntityToCollection(this, coll)
            }
        }, this);
        return this;
    };

    Entity.prototype.get = function(compId) {
        if(typeof compId === "number")
            return this.comps[getCompId(compId,this.world)];
        else
            return this.comps[this.world.componentNames[compId]];
    };

    Entity.prototype.has = function(compId) {
        if(typeof compId === "number"){
            return this.comps[getCompId(compId,this.world)] !== undefined;
        } else {
            return this.comps[this.world.componentNames[compId]] !== undefined;
        }
    };

    Entity.prototype.doWith = function(compId,f){
        if(this.has(compId)){
            return (f.bind(this))(this.get(compId));
        } else {
            throw new Error("Can't get component "+compId+" from "+this);
        }
    };


    Entity.prototype.remove = function(compId) {
        var ent = this;
        compId = getCompId(compId,this.world)
        if (this.comps[compId] === undefined) throw new Error("The entity doesn't have the component");
        var tmp = this.comps[compId];
        this.comps[compId] = undefined
        this.belongsTo.forEach(function (collBelonging, elm) {
            if (!qualifiesForCollection(this, collBelonging.comps)) {
                this.comps[compId] = tmp;
                collBelonging.collRef.removal.forEach(function(func){
                    collBelonging.collRef.callWithComps(ent, func);
                });
                this.comps[compId] = undefined;
                collBelonging.entry.remove()
                elm.remove()
            }
        }, this)

        return this
    }

    Entity.prototype.trigger = function (compId, arg1, arg2, arg3, arg4, arg5, arg6, arg7) {
        compId = getCompId(compId,this.world)
        this.add(compId, arg1, arg2, arg3, arg4, arg5, arg6, arg7)
        this.remove(compId)
    }

    Entity.prototype["delete"] = function() {
        var that = this;
        this.belongsTo.forEach(function (collBelonging, elm) {
            var coll = collBelonging.collRef;
            if(coll.removal) coll.removal.forEach(function(func){
                coll.callWithComps(that, func);
            });
        });
        this.belongsTo.forEach(function (collBelonging, elm) {
            collBelonging.entry.remove();
        });
    }

    Kran.prototype.entity = function () {
        return new Entity(this.components,this)
    }

    var CollectionBelonging = function (comps, entry, coll) {
        this.comps = comps
        this.entry = entry
        this.collRef = coll;
    }

    var addEntityToCollection = function(ent, coll) {
        coll.arrival.forEach(function (func) {
            coll.callWithComps(ent, func)
        })
        var collEntry = coll.ents.add(ent)
        ent.belongsTo.add(new CollectionBelonging(coll.comps, collEntry, coll))
    }

    function getCompId(compId,world) {
        if (typeof compId === "number") { 
            return compId
        } else if (typeof compId === "object" && typeof compId.id === "number") {
            return compId.id
        } else if (typeof compId === "string" && typeof world.componentNames[compId] !== "undefined") {
            return world.componentNames[compId];
        }
        throw new TypeError(compId + " is not a component id or an oject containing an id")
    }

    var qualifiesForCollection = function (ent, comps) {
        return comps.every(function (compId) {
            if (ent.comps[compId] === undefined) {
                return false
            }
            return true
        })
    }

    // ***********************************************
    // Event system
    //
    Kran.prototype.trigger = function(name, data) {
        var event = new CustomEvent(name, { detail: data })
        window.dispatchEvent(event)
    }

    // ***********************************************
    // Helper functions
    //
    var isFunc = function(func) {
        if (typeof func === 'function') {
            return true
        } else {
            return false
        }
    }

    var wrapInArray = function(arg) {
        if (arg instanceof Array) {
            return arg
        } else {
            return [arg]
        }
    }

    // ***********************************************
    // Linked list
    //
    var LinkedList = Kran.LinkedList = function () {
        this.head = null
        this.tail = null
        this.length = 0
    }

    function Element(data, list) {
        this.data = data
        this.list = list
        this.prev = list.tail
        this.next = null
    }

    Element.prototype.remove = function() {
        if (this.prev) {
            this.prev.next = this.next
        } else {
            this.list.head = this.next
        }
        if (this.next) {
            this.next.prev = this.prev
        } else {
            this.list.tail = this.prev
        }
        this.list.length--
    }

    LinkedList.prototype.add = function(data) {
        var elm = new Element(data, this)
        if (this.tail) {
            this.tail.next = elm
        } else {
            this.head = elm
        }
        this.tail = elm
        this.length++
        return elm
    }

    LinkedList.prototype.forEach = function(func, context) {
        var elm, nextElm = this.head
        
        while (nextElm !== null) {
            elm = nextElm
            nextElm = elm.next
            func.call(context, elm.data, elm)
        }
    }

    // ***********************************************
    // Export
    //
    if (typeof module === "object" && // CommonJS
        typeof module.exports === "object") {
        console.log("CommonJS")
        module.exports = Kran
    } else if (typeof define === "function" && define.amd) { // AMD module
        console.log("AMD")
        define("kran", [], function() { return Kran } )
    } else { // Otherwise just attach to the global object
        console.log("Global")
        this.Kran = Kran
    }

}).call(this)
