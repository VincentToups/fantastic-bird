 var THREE = require("three");
var Kran = require("./kran.js");
var puff = require("./puff.js");
var pr = require("./pixel-ratio.js");
var inherits = require('inherit-class');
var boxIntersect = require("box-intersect");
var tc = require("tinycolor2");
var key = require('keycodes');
var keys = function(){
    return Array.prototype.slice.call(arguments,0,arguments.length).map(oneKey);
    function oneKey(k){
        return key(k);
    }
};
var pi = Math.PI;

function colorToNumber(clr){
    return parseInt(clr.toHex(),16);
}

puff.pollute(window);

function PlayWorld(){
    this.animating = false;
    Kran.call(this);

    this.dt = 30;
    this.now = Date.now();

    this.setupThree();

    var scene = this.scene;

    var c = this.component.bind(this);
    c("geom");
    c("mtrl");
    c("bullet");
    c("targetable");
    c("msh",function(geom, mtrl){
        this.msh = new THREE.Mesh(geom, mtrl);
    });
    c("srtn",function(rx,ry){
        this.rx = rx;
        this.ry = ry;
    });
    c("vel",function(x,y,z,mx,my,mz){
        this.x = x || 0;
        this.y = y || 0;
        this.z = z || 0;
        this.mx = typeof mx === "undefined" ? Infinity : mx;
        this.my = typeof my === "undefined" ? Infinity : my;
        this.mz = typeof mz === "undefined" ? Infinity : mz;        
    });
    c("friction",function(){
        var args = Array.prototype.slice.call(arguments,0,arguments.length);
        this.x = args[0];
        this.y = typeof args[1] === 'undefined' ? args[0] : args[1];
        this.z = typeof args[2] === 'undefined' ? args[0] : args[2];
    });
    c("target-rotation",function(rate,x,y,z){
        this.x = x || 0;
        this.y = y || 0;
        this.z = z || 0;
        this.rate = rate;
    });
    c("velocity-target-rotation-relation",function(fOfVel){
        this.fOfVel = fOfVel;
    });
    c("collect-predicate",function(p){
        this.p = p;
    });
    
    var s = this.system.bind(this);
    var bulletBoxes = undefined;
    var bulletMap = undefined;
    var targetMap = undefined;
    var bbox = new THREE.Box3();
    var self = this;
    s({
        name:"bullets",
        components:["geom","mtrl","msh","bullet"],
        pre:function(){
            bulletBoxes = [];
            bulletMap = [];
            targetMap = [];
        },
        every:function(g,m,msh,bl,e){
            bbox.setFromObject(msh.msh);
            bulletBoxes.push([bbox.min.x,bbox.min.y,bbox.min.z,
                             bbox.max.x,bbox.max.y,bbox.max.z]);
            bulletMap.push(e);
        },
        post:function(){
            var targets = self.mapSystemEntities(function(g,m,msh,tg,e){
                bbox.setFromObject(msh.msh);
                targetMap.push(e);
                return [bbox.min.x,bbox.min.y,bbox.min.z,
                        bbox.max.x,bbox.max.y,bbox.max.z];
            },"targets");
            boxIntersect(bulletBoxes,targets,function(bi,ti){
                self.delete(targetMap[ti]);
                self.delete(bulletMap[bi]);
            });
            bulletBoxes = [];
            bulletMap = [];
            targetMap = [];
        }
    });
    s({
        name:"targets",
        components:["geom","mtrl","msh","targetable"]
    });
    s({
        name:"renderables",
        components:["geom","mtrl","msh"],
        arrival:function(geom,mtrl,msh){
            console.log("In add function", msh);
            scene.add(msh.msh);
        },
        removal:function(geom,mtrl,msh){
            scene.remove(msh.msh);
        }
    });
    s({
        name:"rotating",
        components:["msh","srtn"],
        every:function(msh,srtn){
            msh.rotation.x += srtn.rx;
            msh.rotation.y += srtn.ry;
        }
    });
    s({
        name:"damped",
        components:["vel","friction"],
        every:function(v,f){
            v.x *= f.x;
            v.y *= f.y;
            v.z *= f.z;
        }
    });
    s({
        name:"moving",
        components:["msh","vel"],
        every:function(msh,vel){
            msh.msh.position.x += vel.x;
            msh.msh.position.y += vel.y;
            msh.msh.position.z += vel.z;
        }
    });
    s({
        name:"tend-rotation",
        components:["msh","target-rotation"],
        every:function(msh,tg){
            msh.msh.rotation.x = tg.rate*tg.x + (1-tg.rate)*msh.msh.rotation.x;
            msh.msh.rotation.y = tg.rate*tg.y + (1-tg.rate)*msh.msh.rotation.y;
            msh.msh.rotation.z = tg.rate*tg.z + (1-tg.rate)*msh.msh.rotation.z;
        }
    });
    s({
        name:"target-rot-follows-velocity",
        components:["vel","target-rotation","velocity-target-rotation-relation"],
        every:function(vel,tr,rel){
            var rs = rel.fOfVel(vel);
            tr.x = rs.x;
            tr.y = rs.y;
            tr.z = rs.z;
        }
    });
    var collectList = undefined;
    s({
        name:"collected",
        components:["collect-predicate"],
        pre:function(){
            collectList = [];
        },
        every:function(cp,ent){
            if(cp.p(ent)){
                collectList.push(ent);
            }
        },
        post:function(){
            collectList.forEach(function(e){
                e.delete();
            });
            collectList = [];
        }
    });    
    this.initWorld();
}
inherits(PlayWorld,Kran);

function definedP(x){
    return typeof x !== "undefined";
}

PlayWorld.prototype.farFromCamera = function(e){
    var c = this.camera;
    var msh = e.get("msh").msh;
    return c.position.distanceTo(msh.position) > 30;
};

PlayWorld.prototype.setVelocity = function(e,vx,vy,vz){
    e.doWith("vel",function(v){
        if(definedP(vx)) v.x = vx;
        if(definedP(vy)) v.y = vy;
        if(definedP(vz)) v.z = vz;
    });
};

PlayWorld.prototype.setTargetRotation = function(e,tx,ty,tz){
    e.doWith("target-rotation",function(t){
        if(definedP(tx)) t.x = tx;
        if(definedP(ty)) t.y = ty;
        if(definedP(tz)) t.z = tz;
    });
};

PlayWorld.prototype.method = function(nm){
    return this[nm].bind(this);
};

PlayWorld.prototype.keyDown = function(evt){
    this.pressedKeys[evt.which] = true;
    return false;
};

PlayWorld.prototype.isPressed = function(){
    var keyList = Array.prototype.slice.call(arguments,0,arguments.length);
    var pr = this.pressedKeys;
    return keyList.some(function(kc){
        return pr[kc];
    });
};

PlayWorld.prototype.addKeyDownHook = function(keys,cb){
    keys
        .split(' ')
        .map(key)
        .forEach((function(key){
            var hooks = this.keyHooks[key] || [];
            hooks.push(cb.bind(this));
            this.keyHooks[key] = hooks;
        }).bind(this));
};

PlayWorld.prototype.keyUp = function(evt){
    this.pressedKeys[evt.which] = false;
    return false;
};

PlayWorld.prototype.handleInputs = function(){
    Object.keys(this.pressedKeys).forEach(handleKey.bind(this));
    function handleKey(key){
        if(this.pressedKeys[key]){
            (this.keyHooks[key]||[]).map(call);
        }
    };
    function call(f){
        return f();
    }
};

PlayWorld.prototype.updateTime = function(){
    var lastNow = this.now;
    this.now = Date.now();
    this.dt = this.now - lastNow;
    if(this.dt>100) this.dt = 100;
};

PlayWorld.prototype.initControls = function(){
    this.pressedKeys = {};
    this.keyHooks = {};
    this.bulletPeriod = 100;
    this.lastFire = -Infinity;
    
    // var xSpeed = 0.1;
    // var ySpeed = 0.1;
    // var playerMesh = this.player.get("msh");
    
    document.addEventListener("keydown", this.method("keyDown"), false);
    document.addEventListener("keyup", this.method("keyUp"), false);

    this.addKeyDownHook('up w', function(){
        this.setVelocity(this.player,0,0.025,0);
    });
    this.addKeyDownHook('down s', function(){
        this.setVelocity(this.player,0,-0.025,0);
    });

    this.addKeyDownHook('left a', function(){
        this.setVelocity(this.player,-0.025,0,0);
    });
    this.addKeyDownHook('right d', function(){
        this.setVelocity(this.player,0.025,0,0);
    });
    this.addKeyDownHook('space', function(){
        if((this.now - this.lastFire) > this.bulletPeriod){
            this.bullet();
            this.lastFire = this.now;
        }
    });


    
    // function onDocumentKeyDown(event) {
    //     console.log("Got a key down event",event.which);
    //     var keyCode = event.which;
        
    //     if (keyCode == 87) {
    //         playerMesh.position.y += ySpeed;
    //     } else if (keyCode == 83) {
    //         playerMesh.position.y -= ySpeed;
    //     } else if (keyCode == 65) {
    //         playerMesh.position.x -= xSpeed;
    //     } else if (keyCode == 68) {
    //         playerMesh.position.x += xSpeed;
    //     } else if (keyCode == 32) {
    //         playerMesh.position.set(0, 0, 0);
    //     }
    // };
};

PlayWorld.prototype.bullet = function(from, speed){
    from = from || this.player;
    speed = definedP(speed) ? speed : 0.75;
    var heading = from.getHeading ?
            from.getHeading() :
            from.get("msh").msh.rotation.clone();
    var vel = new THREE.Vector3(0,0,-speed);
    vel.applyEuler(heading);
    var position = from.getPosition ?
            from.getPosition() :
            from.get("msh").msh.position.clone();
    var g = new THREE.ConeGeometry(0.1,0.5,3);
    g.rotateX(-pi/2);
    var m = new THREE.MeshPhongMaterial({
        color:0xffff00,
        specular:0xffffff,
        shininess:150
    });
    var e = this.entity()
            .add("geom",g)
            .add("mtrl",m)
            .add("bullet");
    e.add("msh",g,m);
    e.add("vel",vel.x,vel.y,vel.z);
    var msh = e.get("msh").msh;
    msh.rotation.x = heading.x;
    msh.rotation.y = heading.y;
    msh.rotation.z = heading.z;
    msh.position.x = position.x;
    msh.position.y = position.y;
    msh.position.z = position.z;
    e.add("collect-predicate",this.method("farFromCamera"));
};

PlayWorld.prototype.initPlayer = function(){
    this.player = this.entity();
    //var g = new THREE.BoxGeometry(0.5,0.5,1.2);
    var g = new THREE.ConeGeometry(0.25,1.2,3);
    g.rotateX(-pi/2);
    var m = new THREE.MeshPhongMaterial({
        color:0xff0000,
        specular:0xffffff,
        shininess:10
    });
    this.player.add("geom",g).add("mtrl",m);
    this.player.add("msh",g,m);
    this.player.get("msh").msh.position.set(0,2,1);
    this.player.add("vel",0,0.025,0);
    this.player.add("friction",0.9);
    this.player.add("target-rotation",0.085,0,0,0);
    this.player.add("velocity-target-rotation-relation",function(vel){
        return {
            x:pzn(vel.y,pi/4,0,-pi/4),
            y:pzn(vel.x,-pi/8,0,pi/8),
            z:pzn(vel.x,-pi/8,0,pi/8)
        };
        function pzn(v,p,z,n){
            if(v>0.01) return p;
            if(v<-0.01) return n;
            return z;
        }
    });
    this.player.getHeading = function(){
        return this.get("msh").msh.rotation.clone();
    };
    this.player.getPosition = function(){
        return this.get("msh").msh.position.clone();
    };
};

PlayWorld.prototype.initWorld = function(){
    // var b1 = this.block({position:[0,0.5,0],shape:[1,1,1]});
    // var b2 = this.block({position:[1,1.5,0],shape:[1,3,1]});
    this.floorLength = 100;
    this.floorWidth = 7;
    this.initFloor(randomFloor(this.floorWidth,this.floorLength));
    this.cameraIncr = -0.07;

    this.initPlayer();
    this.initControls();

    
    return this;

    function randomFloor(w,l){
        return ia(l,function(i){
            return ia(w,function(){
                return (1+0.1*Math.random() +
                        (Math.random()<0.1 ? Math.round(3*Math.random()) : 0));
            });
        });
    }
};

function intInRange(lw,hg){
    return Math.round(lw+(hg-lw)*Math.random());
}

PlayWorld.prototype.initFloor = function(heightMap,zInit,xInit){
    zInit = typeof zInit === "undefined" ? -5 : zInit;
    xInit = typeof xInit === "undefined" ? -heightMap[0].length/2 : xInit ;
    var self = this;
    console.log(heightMap);
    heightMap.forEach(function(row,rowIndex){
        row.forEach(function(h,colIndex){
            var opts = {
                targetable:h>0.5 ? true : false,
                position:[xInit+0.5+colIndex,h/2,-rowIndex+zInit],
                shape:[1,h,1],
                color:colorToNumber(tc({r:intInRange(0,200),g:intInRange(200,254),b:intInRange(0,200)}))};
            console.log(JSON.stringify(opts,null,"  "));
            self.block(opts);
        });
    });
};

PlayWorld.prototype.setupThree = function(){
    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera( 75, window.innerWidth/window.innerHeight, 0.1, 1000 );
    
    var renderer = new THREE.WebGLRenderer();
    //renderer.setSize( window.innerWidth*pr.pixelRatio, window.innerHeight*pr.pixelRatio );
    renderer.setSize( window.innerWidth, window.innerHeight );
    document.body.appendChild( renderer.domElement );
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;

    camera.position.z = 5;
    camera.position.y = 2;

    var dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(-5, 10, 0);
    scene.add(dirLight);

    var ambientLight = new THREE.AmbientLight( 0xffffff, 0.6 );
    scene.add(ambientLight);

    this.dirLight = dirLight;
    this.ambientLight = ambientLight;
    return this;
};



PlayWorld.prototype.block = function(opts){
    opts = cascadeIntoOutput(opts||{},PlayWorld.prototype.block.opts);
    var shape = opts('shape');
    var g = new THREE.BoxGeometry(shape[0],shape[1],shape[2]);
    console.log('colr in opts is: ',opts('color'));
    var m = new THREE.MeshPhongMaterial({
        color:opts('color'),
        specular:opts("specular"),
        shininess:opts("shininess")
    });
    var e = this.entity()
            .add("geom",g)
            .add("mtrl",m);
    e.add("msh",g,m);
    var pos = opts('position');
    e.get("msh").msh.position.set(pos[0],pos[1],pos[2]);
    if(opts('targetable')) e.add("targetable");
    return e;
};
PlayWorld.prototype.block.opts = {
    targetable:false,
    position:[0,0,0],
    color:0x00ff00,
    specular:0x555555,
    shininess:10,
    shape:[1,1,1]
};

PlayWorld.prototype.start = function(){
    if(this.animating) return this;
    this.animating = true;
    this.render();
    return this;
};

PlayWorld.prototype.stop = function(){
    this.animating = false;
    return this;
};



PlayWorld.prototype.render = function(){
    if(this.animating){
        this.updateTime();
        this.handleInputs();
        this.runSystem("moving");
        this.runSystem("damped");
        this.runSystem("target-rot-follows-velocity");
        this.runSystem("tend-rotation");
        this.runSystem("collected");
        this.runSystem("bullets");
        this.renderer.render(this.scene, this.camera);
        this.camera.position.z += this.cameraIncr;
        if(this.camera.position.z < -100){
            this.camera.position.z = -100;
            this.cameraIncr = this.cameraIncr*-1.0;
        }
        if(this.camera.position.z > 5){
            this.camera.position.z = 5;
            this.cameraIncr = this.cameraIncr*-1.0;
        }
        this.player.get("msh").msh.position.z = this.camera.position.z - 2;
        requestAnimationFrame(this.render.bind(this));
    }
};

var pw = new PlayWorld();
pw.start();
