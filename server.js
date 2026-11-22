require("dotenv").config();
const express=require("express"),helmet=require("helmet"),rateLimit=require("express-rate-limit"),bcrypt=require("bcryptjs"),jwt=require("jsonwebtoken"),cookieParser=require("cookie-parser"),path=require("path"),crypto=require("crypto"),db=require("./db");
const app=express();
if(!process.env.JWT_SECRET||process.env.JWT_SECRET.length<32){console.error("Set JWT_SECRET to a random secret of at least 32 characters.");process.exit(1)}
const PROD=process.env.NODE_ENV==="production";
if(PROD&&(!process.env.ADMIN_PASSWORD||process.env.ADMIN_PASSWORD.length<12)){console.error("In production set ADMIN_PASSWORD (12+ chars) and ADMIN_USERNAME.");process.exit(1)}
app.disable("x-powered-by");app.set("trust proxy",1);
// HTTPS only in production (Render/Railway/Fly etc. send x-forwarded-proto).
if(PROD)app.use((req,res,next)=>{if(req.path==="/api/health"||req.secure)return next();res.redirect(301,"https://"+req.headers.host+req.originalUrl)});
const baseCsp={defaultSrc:["'self'"],objectSrc:["'none'"],baseUri:["'self'"],frameAncestors:["'none'"],upgradeInsecureRequests:PROD?[]:null};
// Admin + API: strict CSP. Storefront (public/index.html) has inline scripts and Google Fonts, so it gets a relaxed CSP.
const adminHelmet=helmet({contentSecurityPolicy:{directives:{...baseCsp,scriptSrc:["'self'"],styleSrc:["'self'","'unsafe-inline'"],imgSrc:["'self'","data:","https:"],connectSrc:["'self'"]}},hsts:PROD});
const shopHelmet=helmet({contentSecurityPolicy:{directives:{...baseCsp,scriptSrc:["'self'","'unsafe-inline'"],styleSrc:["'self'","'unsafe-inline'","https://fonts.googleapis.com"],fontSrc:["'self'","https://fonts.gstatic.com","data:"],imgSrc:["'self'","data:","blob:","https:"],connectSrc:["'self'","https://wa.me"],formAction:["'self'","https://wa.me"]}},hsts:PROD});
app.use((req,res,next)=>/^\/(admin|api)(\/|\.|$)/.test(req.path)?adminHelmet(req,res,next):shopHelmet(req,res,next));
app.use(express.json({limit:"100kb"}));app.use(cookieParser());app.use(rateLimit({windowMs:15*60*1000,limit:1000,standardHeaders:true,legacyHeaders:false}));app.use(express.static(path.join(__dirname,"public")));
const authLimiter=rateLimit({windowMs:15*60*1000,limit:8,message:{error:"Too many login attempts. Try later."},skipSuccessfulRequests:true,standardHeaders:true,legacyHeaders:false});
const auth=(req,res,next)=>{const token=req.cookies.rm_admin;if(!token)return res.status(401).json({error:"Authentication required"});try{req.admin=jwt.verify(token,process.env.JWT_SECRET);next()}catch{res.clearCookie("rm_admin");return res.status(401).json({error:"Session expired"})}};
const csrf=(req,res,next)=>{const c=req.cookies.rm_csrf,h=req.get("x-csrf-token");if(!c||!h||c!==h)return res.status(403).json({error:"CSRF check failed"});next()};
const safeText=(v,max=500)=>typeof v==="string"?v.trim().slice(0,max):"";
const validPhone=s=>/^[+\d()\-\s]{7,24}$/.test(s);
app.get("/api/health",(req,res)=>res.json({status:"ok"}));
app.get("/api/public/products",(req,res)=>res.json(db.publicProducts()));
app.get("/api/public/settings",(req,res)=>res.json(db.getPublicSettings()));
// Cash-on-delivery only. No payment provider or card details are accepted or stored.
app.post("/api/public/orders",rateLimit({windowMs:10*60*1000,limit:12,standardHeaders:true,legacyHeaders:false}), (req,res)=>{
 const body=req.body||{},customer=safeText(body.customer,120),phone=safeText(body.phone,24),email=safeText(body.email,160),address=safeText(body.address,1200);
 const preferredDate=safeText(body.preferredDate,10),preferredSlot=safeText(body.preferredSlot,40);
 if(!customer||!validPhone(phone)||address.length<8)return res.status(400).json({error:"Please provide name, valid phone, and complete delivery address."});
 if(preferredDate&&!/^\d{4}-\d{2}-\d{2}$/.test(preferredDate))return res.status(400).json({error:"Invalid delivery date."});
 // Cart lines are keyed by product + size on the storefront, so the same product can appear more than once.
 const rows=Array.isArray(body.items)?body.items.slice(0,50):[];
 const products=db.listProducts().filter(p=>p.active);const clean=[];const demand=new Map();let subtotal=0;
 for(const row of rows){
  const pid=Number(row?.productId),qty=Math.floor(Number(row?.quantity)),size=safeText(row?.size,20);
  if(!Number.isInteger(pid)||!Number.isInteger(qty)||qty<1||qty>50)return res.status(400).json({error:"Invalid cart item"});
  const p=products.find(x=>x.id===pid);if(!p)return res.status(400).json({error:"Invalid cart item"});
  const need=(demand.get(pid)||0)+qty;demand.set(pid,need);
  if(need>p.stock)return res.status(409).json({error:`Not enough stock for ${p.name}`});
  clean.push({productId:p.id,name:p.name,size,unitPrice:p.price,quantity:qty,lineTotal:Number((p.price*qty).toFixed(2))});subtotal+=p.price*qty;
 }
 if(!clean.length)return res.status(400).json({error:"Cart is empty"});
 // Same delivery rule the storefront shows: free delivery from Rs 2,999, otherwise Rs 99.
 const delivery=subtotal>=2999?0:99;const total=Number((subtotal+delivery).toFixed(2));
 const note=preferredDate?`Preferred delivery: ${preferredDate}${preferredSlot?", "+preferredSlot:""}`:"";
 let order;try{order=db.addOrder({customer,phone,email,address,note,total,items:clean})}catch(e){return res.status(409).json({error:e.message||"Order could not be placed"})}
 res.status(201).json({ok:true,orderId:order.id,paymentMethod:"COD",message:"Order received. Payment is due on delivery."});
});
app.post("/api/admin/login",authLimiter,async(req,res)=>{const username=safeText(req.body?.username,80),password=typeof req.body?.password==="string"?req.body.password:"",admin=db.getAdmin();if(!admin||username!==admin.username||!(await bcrypt.compare(password,admin.password_hash)))return res.status(401).json({error:"Invalid credentials"});const token=jwt.sign({sub:admin.username,role:"admin"},process.env.JWT_SECRET,{expiresIn:"2h"}),csrfToken=crypto.randomBytes(32).toString("hex");res.cookie("rm_admin",token,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"strict",maxAge:2*60*60*1000});res.cookie("rm_csrf",csrfToken,{httpOnly:false,secure:process.env.NODE_ENV==="production",sameSite:"strict",maxAge:2*60*60*1000});res.json({ok:true,csrf:csrfToken})});
app.post("/api/admin/logout",auth,csrf,(req,res)=>{res.clearCookie("rm_admin");res.clearCookie("rm_csrf");res.json({ok:true})});app.get("/api/admin/me",auth,(req,res)=>res.json({username:req.admin.sub,csrf:req.cookies.rm_csrf}));
app.get("/api/admin/dashboard",auth,(req,res)=>res.json(db.dashboard()));app.get("/api/admin/products",auth,(req,res)=>res.json(db.listProducts()));
const productInput=p=>({name:safeText(p.name,160),price:Number(p.price),stock:Math.max(0,Math.floor(Number(p.stock)||0)),description:safeText(p.description,2000),imageUrl:safeText(p.imageUrl,1000),category:safeText(p.category,120),active:p.active!==false});
app.post("/api/admin/products",auth,csrf,(req,res)=>{const p=productInput(req.body||{});if(!p.name||!Number.isFinite(p.price)||p.price<0||p.price>99999999)return res.status(400).json({error:"Invalid product data"});res.status(201).json(db.addProduct(p))});
app.put("/api/admin/products/:id",auth,csrf,(req,res)=>{const id=Number(req.params.id),p=productInput(req.body||{});if(!Number.isInteger(id)||id<1||!p.name||!Number.isFinite(p.price)||p.price<0)return res.status(400).json({error:"Invalid product data"});const updated=db.updateProduct(id,p);if(!updated)return res.status(404).json({error:"Product not found"});res.json(updated)});
app.delete("/api/admin/products/:id",auth,csrf,(req,res)=>{const id=Number(req.params.id);if(!Number.isInteger(id)||id<1)return res.status(400).json({error:"Invalid id"});db.deleteProduct(id);res.json({ok:true})});
app.get("/api/admin/orders",auth,(req,res)=>res.json(db.listOrders()));app.get("/api/admin/customers",auth,(req,res)=>res.json(db.listCustomers()));
app.patch("/api/admin/orders/:id/status",auth,csrf,(req,res)=>{const statuses=["pending","processing","shipped","delivered","cancelled"],status=safeText(req.body?.status,20);if(!statuses.includes(status))return res.status(400).json({error:"Invalid status"});const order=db.setOrderStatus(Number(req.params.id),status);if(!order)return res.status(404).json({error:"Order not found"});res.json(order)});
app.get("/api/admin/settings",auth,(req,res)=>res.json(db.getSettings()));app.put("/api/admin/settings",auth,csrf,(req,res)=>res.json(db.saveSettings(req.body||{})));
app.get("/admin",(req,res)=>res.sendFile(path.join(__dirname,"public","admin.html")));
app.listen(process.env.PORT||3000,()=>console.log("Rahul Mart backend running on port "+(process.env.PORT||3000)));
