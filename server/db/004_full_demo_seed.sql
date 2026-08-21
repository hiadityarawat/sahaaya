-- Fictional portfolio data only. The shared password is DemoPass!2026 and must never be used in production.
INSERT INTO users(id,name,email,password_hash,role,email_verified)
VALUES
('00000000-0000-4000-8000-000000000001','Demo Administrator','admin@sahaaya.demo',crypt('DemoPass!2026',gen_salt('bf',12)),'ADMIN',true),
('00000000-0000-4000-8000-000000000002','Hope Foundation Owner','hope@sahaaya.demo',crypt('DemoPass!2026',gen_salt('bf',12)),'ORGANIZATION',true),
('00000000-0000-4000-8000-000000000003','Rapid Aid Owner','rapid@sahaaya.demo',crypt('DemoPass!2026',gen_salt('bf',12)),'ORGANIZATION',true),
('00000000-0000-4000-8000-000000000004','Community Care Owner','care@sahaaya.demo',crypt('DemoPass!2026',gen_salt('bf',12)),'ORGANIZATION',true)
ON CONFLICT(email) DO NOTHING;

INSERT INTO users(id,name,email,password_hash,role,email_verified)
SELECT ('10000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'Demo Volunteer '||n,'volunteer'||n||'@sahaaya.demo',crypt('DemoPass!2026',gen_salt('bf',12)),'VOLUNTEER',true FROM generate_series(1,15) n ON CONFLICT(email) DO NOTHING;

INSERT INTO users(id,name,email,password_hash,role,email_verified)
SELECT ('20000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'Demo Resident '||n,'resident'||n||'@sahaaya.demo',crypt('DemoPass!2026',gen_salt('bf',12)),'USER',true FROM generate_series(1,10) n ON CONFLICT(email) DO NOTHING;

INSERT INTO organizations(id,owner_id,name,verified_at,public_area) VALUES
('30000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','Hope Foundation',now(),'Whitefield'),
('30000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003','Rapid Aid Collective',now(),'Bellandur'),
('30000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000004','Community Care Trust',now(),'Marathahalli') ON CONFLICT(id) DO NOTHING;

INSERT INTO volunteers(user_id,skills,areas,available)
SELECT ('10000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,ARRAY[(ARRAY['FOOD','WATER','MEDICAL','SHELTER','RESCUE','TRANSPORT'])[((n-1)%6)+1],'GENERAL'],ARRAY[(ARRAY['Whitefield','Bellandur','Marathahalli','Mahadevapura'])[((n-1)%4)+1]],n%5<>0 FROM generate_series(1,15) n ON CONFLICT(user_id) DO NOTHING;

INSERT INTO help_requests(public_id,requester_id,disaster_event_id,category,public_area,people_count,description,urgency,contact_method,status,created_at,updated_at)
SELECT 'REQ-2026-'||(10431+n),('20000000-0000-4000-8000-'||lpad((((n-1)%10)+1)::text,12,'0'))::uuid,(SELECT id FROM disaster_events ORDER BY starts_at DESC LIMIT 1),(ARRAY['FOOD','WATER','MEDICAL','SHELTER','RESCUE','TRANSPORT'])[((n-1)%6)+1],(ARRAY['Whitefield','Bellandur','Marathahalli','Mahadevapura'])[((n-1)%4)+1],1+(n*7)%18,'Fictional demo emergency request for portfolio testing.',(ARRAY['NORMAL','URGENT','CRITICAL']::urgency_level[])[((n-1)%3)+1],'IN_APP',(ARRAY['OPEN','ACCEPTED','VOLUNTEER_ASSIGNED','IN_PROGRESS','RESOLVED']::request_status[])[((n-1)%5)+1],now()-(n||' minutes')::interval,now()-(n||' minutes')::interval FROM generate_series(1,30) n ON CONFLICT(public_id) DO NOTHING;

INSERT INTO resources(id,organization_id,name,category,quantity,unit) VALUES
('40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','Prepared meals','FOOD',2450,'meals'),
('40000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002','Water bottles','WATER',4820,'bottles'),
('40000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000003','First aid kits','MEDICAL',126,'kits'),
('40000000-0000-4000-8000-000000000004','30000000-0000-4000-8000-000000000001','Shelter spaces','SHELTER',84,'spaces'),
('40000000-0000-4000-8000-000000000005','30000000-0000-4000-8000-000000000003','Blankets','CLOTHES',730,'blankets') ON CONFLICT(id) DO NOTHING;
