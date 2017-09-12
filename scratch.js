var kran = new Kran();

var geom = kran.component("geom");
var mtrl = kran.component("mtrl");
var msh = kran.component(function(g, m){
    console.log("In msh constructor", g, m);
    return new THREE.Mesh( g.geom, m.mtrl );
});

var srtn = kran.component(function(rx,ry){
    this.rx = rx;
    this.ry = ry;
});

var renderables = kran.system({
    components:[geom,mtrl,msh],

});

var rotating = kran.system({
    components:[msh,srtn],
    every:function(msh,srtn,e){
        msh.rotation.x += srtn.rx;
        msh.rotation.y += srtn.ry;
    }
});


function apply(f,lst){
    return f.apply(this, lst);
}

function boxGeom(wx,wy,wz){
    return new THREE.BoxGeometry(wx,wy,wz);
}

function phngMat(color, specular, shininess){
    color = typeof color === "undefined" ? 0x00ff00 : color;
    specular = typeof specular === "undefined" ? 0x555555 : specular;
    shininess = typeof shininess === "undefined" ? 10 : shininess;
    return new THREE.MeshPhongMaterial({ color: 0x00ff00,  specular: 0x555555, shininess: 10});
}

var cubeOptions = {

};


function makeCube(options){
    options = cascadeIntoOutput(options||{},cubeOptions);
    var ageom = new THREE.BoxGeometry( 1, 1, 1 );
    amtrl = amtrl || new THREE.MeshPhongMaterial({ color: 0x00ff00,  specular: 0x555555, shininess: 10});
    posn = posn || [0,0,0];
    var out = kran.entity()
            .add(geom, ageom)
            .add(mtrl, amtrl); 
    out.add(msh,out.get(geom),out.get(mtrl));
    out.get(msh).position.set(posn[0],posn[1],posn[2]);
    return out;
}

// var cube = kran.entity()
//         .add(geom, new THREE.BoxGeometry( 1, 1, 1 ))
//         .add(mtrl, new THREE.MeshPhongMaterial({ color: 0x00ff00,  specular: 0x555555, shininess: 10}));
// cube.add(msh,cube.get(geom),cube.get(mtrl));
var cube = makeCube();
cube.add(srtn,0.1,0.1);

var cube2 = makeCube([1,1,0]);
cube2.add(srtn,-0.1,-0.1);




var animate = function () {
    requestAnimationFrame( animate );
    kran.run(rotating);
    renderer.render(scene, camera);
};

animate();
