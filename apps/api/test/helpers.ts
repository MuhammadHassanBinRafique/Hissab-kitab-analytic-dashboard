import { createPgliteDb } from "./pglite-db";

/** A real Postgres (PGlite) with the portal's schema + RLS, our analytics_ro role/policies and two users' data. */
export const makeTestDb = () => createPgliteDb(SEED);

const SEED = `
INSERT INTO users (id, email, "updatedAt") VALUES ('user-a','a@x.com',now()), ('user-b','b@x.com',now());

INSERT INTO accounts (id,"userId",name,type,"openingBalance","currentBalance","isArchived","updatedAt") VALUES
 ('a-meezan','user-a','Meezan Bank','BANK',20000,61700,false,now()),
 ('a-cash','user-a','Cash','CASH',5000,8500,false,now()),
 ('a-old','user-a','Old wallet','OTHER',0,999,true,now()),
 ('b-acc','user-b','B Bank','BANK',0,777,false,now());

INSERT INTO categories (id,"userId",name,kind) VALUES
 ('c-salary','user-a','Salary','INCOME'), ('c-food','user-a','Food','EXPENSE'), ('c-bills','user-a','Bills','EXPENSE');

INSERT INTO transactions (id,"userId",type,amount,description,date,"accountId","categoryId","fromAccountId","toAccountId","updatedAt") VALUES
 ('t1','user-a','INCOME',60000.10,'Nov salary','2026-11-01','a-meezan','c-salary',NULL,NULL,now()),
 ('t2','user-a','EXPENSE',1200.20,'Groceries','2026-11-05','a-meezan','c-food',NULL,NULL,now()),
 ('t3','user-a','EXPENSE',4500,'Electricity','2026-11-06','a-meezan','c-bills',NULL,NULL,now()),
 ('t4','user-a','INCOME',60000.10,'Oct salary','2026-10-01','a-meezan','c-salary',NULL,NULL,now()),
 ('t5','user-a','EXPENSE',3000,'Groceries','2026-10-03','a-meezan','c-food',NULL,NULL,now()),
 ('t6','user-a','EXPENSE',1000,'Groceries','2026-09-02','a-meezan','c-food',NULL,NULL,now()),
 ('t7','user-a','TRANSFER',4000,'Cash withdrawal','2026-11-12',NULL,NULL,'a-meezan','a-cash',now()),
 ('t8','user-a','INCOME',1000.05,'Aug bonus','2026-08-01','a-meezan','c-salary',NULL,NULL,now()),
 ('tb','user-b','INCOME',777,'B income','2026-11-02','b-acc',NULL,NULL,NULL,now());

INSERT INTO savings (id,"userId",name,"targetAmount","currentAmount","targetDate",status,"updatedAt") VALUES
 ('s1','user-a','Emergency fund',100000,5000,'2027-06-01','ACTIVE',now()),
 ('s2','user-a','Old goal',1000,1000,NULL,'COMPLETED',now());
INSERT INTO saving_transactions (id,"savingId","accountId",amount,date,description) VALUES
 ('st1','s1','a-meezan',5000,'2026-11-05','Deposit'),
 ('st2','s1','a-meezan',-1000,'2026-11-20','Withdraw'),
 ('st3','s1','a-meezan',5000,'2026-10-05','Deposit');

INSERT INTO recurring_transactions (id,"userId",type,amount,description,"accountId","categoryId",frequency,"dayOfMonth","nextRunDate","isActive","updatedAt")
 VALUES ('r1','user-a','EXPENSE',4500,'Electricity','a-meezan','c-bills','MONTHLY',5,'2026-12-05',true,now());

INSERT INTO audit_logs (id,"createdAt","userId",event,success,"statusCode",response,method,path)
 SELECT 'log-' || lpad(n::text, 3, '0'), timestamp '2026-11-10 00:00' + (n || ' minutes')::interval, 'user-a',
        'auth.sign_in', true, 200, '{"error":null}'::jsonb, 'POST', '/login' FROM generate_series(1, 35) n;
INSERT INTO audit_logs (id,"createdAt","userId",event,success,"statusCode",response,method,path) VALUES
 ('log-fail','2026-11-12 10:00','user-a','transaction.create',false,400,'{"error":"bad"}'::jsonb,'POST','/api/transactions'),
 ('log-b','2026-11-12 10:00','user-b','auth.sign_in',true,200,'{}'::jsonb,'POST','/login');
`;
