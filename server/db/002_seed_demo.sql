-- Clearly fictional portfolio/demo records. Passwords must be created through the API.
INSERT INTO disaster_events(name,status,affected_areas,starts_at) VALUES
('Bengaluru Flood Response','ACTIVE',ARRAY['Whitefield','Marathahalli','Bellandur'],now()-interval '2 days'),
('Coastal Cyclone Preparedness','DRAFT',ARRAY['Udupi','Mangaluru'],now()+interval '5 days'),
('Western Ghats Landslide Recovery','CLOSED',ARRAY['Madikeri'],now()-interval '90 days');
