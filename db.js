const { DatabaseSync } = require("node:sqlite");
const path=require("path"),fs=require("fs");
const dbFile=process.env.DATABASE_FILE||path.join(__dirname,"db","rahul-mart.sqlite");
// Create the folder if it is missing (empty folders are not kept by ZIP/Git, so a fresh copy has no db/).
fs.mkdirSync(path.dirname(dbFile),{recursive:true});
const db=new DatabaseSync(dbFile);
db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
// Transaction helper for the built-in Node SQLite API (no native npm addon required).
const transaction=(fn)=>()=>{db.exec("BEGIN IMMEDIATE");try{const result=fn();db.exec("COMMIT");return result;}catch(err){db.exec("ROLLBACK");throw err;}};
db.exec(`
CREATE TABLE IF NOT EXISTS admins(id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS products(id INTEGER PRIMARY KEY, name TEXT NOT NULL, price REAL NOT NULL, stock INTEGER NOT NULL DEFAULT 0, description TEXT DEFAULT '', image_url TEXT DEFAULT '', category TEXT DEFAULT '', active INTEGER NOT NULL DEFAULT 1, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS customers(id INTEGER PRIMARY KEY, name TEXT NOT NULL, phone TEXT UNIQUE NOT NULL, email TEXT DEFAULT '', address TEXT DEFAULT '', created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS orders(id INTEGER PRIMARY KEY, customer_id INTEGER, customer TEXT NOT NULL, phone TEXT NOT NULL, email TEXT DEFAULT '', address TEXT DEFAULT '', total REAL NOT NULL, status TEXT NOT NULL DEFAULT 'pending', payment_method TEXT NOT NULL DEFAULT 'COD', payment_status TEXT NOT NULL DEFAULT 'pending', items TEXT DEFAULT '', created_at TEXT DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(customer_id) REFERENCES customers(id));
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
`);
// Lightweight migrations for databases created by the starter version.
const ensureColumn=(table,column,definition)=>{const cols=db.prepare(`PRAGMA table_info(${table})`).all().map(c=>c.name);if(!cols.includes(column))db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)};
ensureColumn("products","category","TEXT DEFAULT ''"); ensureColumn("products","active","INTEGER NOT NULL DEFAULT 1");
ensureColumn("orders","customer_id","INTEGER"); ensureColumn("orders","email","TEXT DEFAULT ''"); ensureColumn("orders","address","TEXT DEFAULT ''"); ensureColumn("orders","payment_method","TEXT NOT NULL DEFAULT 'COD'"); ensureColumn("orders","payment_status","TEXT NOT NULL DEFAULT 'pending'");
const bcrypt=require("bcryptjs");
// Sync the admin account from .env on every start (fixes old-password / login mismatch after a reset).
if(process.env.ADMIN_USERNAME&&process.env.ADMIN_PASSWORD){const hash=bcrypt.hashSync(process.env.ADMIN_PASSWORD,12);const existing=db.prepare("SELECT id FROM admins ORDER BY id LIMIT 1").get();if(existing){db.prepare("UPDATE admins SET username=?,password_hash=? WHERE id=?").run(process.env.ADMIN_USERNAME,hash,existing.id);db.prepare("DELETE FROM admins WHERE id<>?").run(existing.id);}else db.prepare("INSERT INTO admins(username,password_hash) VALUES(?,?)").run(process.env.ADMIN_USERNAME,hash);}
const productFields="id,name,price,stock,description,image_url as imageUrl,category,active,created_at";
module.exports={
 getAdmin:()=>db.prepare("SELECT username,password_hash FROM admins LIMIT 1").get(),
 dashboard:()=>({products:db.prepare("SELECT count(*) n FROM products WHERE active=1").get().n,orders:db.prepare("SELECT count(*) n FROM orders").get().n,customers:db.prepare("SELECT count(*) n FROM customers").get().n,pendingOrders:db.prepare("SELECT count(*) n FROM orders WHERE status='pending'").get().n,revenue:db.prepare("SELECT COALESCE(sum(total),0) n FROM orders WHERE status='delivered'").get().n}),
 listProducts:()=>db.prepare(`SELECT ${productFields} FROM products ORDER BY id DESC`).all(),
 publicProducts:()=>db.prepare(`SELECT id,name,price,stock,description,image_url as imageUrl,category FROM products WHERE active=1 AND stock>0 ORDER BY id DESC`).all(),
 addProduct:p=>{const r=db.prepare("INSERT INTO products(name,price,stock,description,image_url,category,active) VALUES(?,?,?,?,?,?,?)").run(p.name,p.price,p.stock,p.description,p.imageUrl,p.category,p.active?1:0);return db.prepare(`SELECT ${productFields} FROM products WHERE id=?`).get(r.lastInsertRowid)},
 updateProduct:(id,p)=>{const r=db.prepare("UPDATE products SET name=?,price=?,stock=?,description=?,image_url=?,category=?,active=? WHERE id=?").run(p.name,p.price,p.stock,p.description,p.imageUrl,p.category,p.active?1:0,id);return r.changes?db.prepare(`SELECT ${productFields} FROM products WHERE id=?`).get(id):null},
 deleteProduct:id=>db.prepare("DELETE FROM products WHERE id=?").run(id),
 listOrders:()=>db.prepare("SELECT * FROM orders ORDER BY id DESC").all(),
 listCustomers:()=>db.prepare("SELECT id,name,phone,email,address,created_at,updated_at FROM customers ORDER BY id DESC").all(),
 addOrder:o=>{const tx=transaction(()=>{
  // Sum demand per product first (a cart can hold several sizes of the same product).
  const demand=new Map();for(const it of o.items)demand.set(it.productId,(demand.get(it.productId)||0)+it.quantity);
  for(const [pid,qty] of demand){const p=db.prepare("SELECT stock,active FROM products WHERE id=?").get(pid);if(!p||!p.active||p.stock<qty)throw new Error("Stock changed. Please refresh your cart.");}
  db.prepare(`INSERT INTO customers(name,phone,email,address,updated_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(phone) DO UPDATE SET name=excluded.name,email=excluded.email,address=excluded.address,updated_at=CURRENT_TIMESTAMP`).run(o.customer,o.phone,o.email,o.address);
  const customer=db.prepare("SELECT id FROM customers WHERE phone=?").get(o.phone);
  const storedAddress=o.note?`${o.address} | ${o.note}`:o.address;
  const r=db.prepare("INSERT INTO orders(customer_id,customer,phone,email,address,total,status,payment_method,payment_status,items) VALUES(?,?,?,?,?,?,?,'COD','pending',?)").run(customer.id,o.customer,o.phone,o.email,storedAddress,o.total,"pending",JSON.stringify(o.items));
  for(const [pid,qty] of demand)db.prepare("UPDATE products SET stock=stock-? WHERE id=?").run(qty,pid);
  return db.prepare("SELECT * FROM orders WHERE id=?").get(r.lastInsertRowid);
});return tx()},
  setOrderStatus:(id,status)=>{const r=db.prepare("UPDATE orders SET status=? WHERE id=?").run(status,id);return r.changes?db.prepare("SELECT * FROM orders WHERE id=?").get(id):null},
 getSettings:()=>Object.fromEntries(db.prepare("SELECT key,value FROM settings").all().map(r=>[r.key,r.value])),
 getPublicSettings:()=>Object.fromEntries(db.prepare("SELECT key,value FROM settings WHERE key IN ('store_name','whatsapp','instagram','phone','email','seo_title','seo_description','landing_headline','landing_copy','logo_url','shipping_note','landing_banner_url','landing_sections_json','address','support_hours')").all().map(r=>[r.key,r.value])),
 saveSettings:obj=>{const allow=["store_name","whatsapp","instagram","phone","email","seo_title","seo_description","landing_headline","landing_copy","logo_url","shipping_note","landing_banner_url","landing_sections_json","address","support_hours"];const tx=transaction(()=>allow.forEach(k=>{if(typeof obj[k]==="string")db.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(k,obj[k].slice(0,10000));}));tx();return module.exports.getSettings();}
};
