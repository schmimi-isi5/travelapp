# Datenmodell — kanonische Entitäten

Alle Entitäten nutzen UUID-IDs, timestamps mit Zeitzone, `created_by`, `updated_at`, `version`, `is_demo`, `source_type`, sofern sinnvoll.

- `families(id,name,owner_user_id)`; `family_members(family_id,user_id,role,status)`; `profiles(user_id,display_name,avatar_path)`; `invitations(family_id,email,role,token_hash,expires_at,accepted_at)`.
- `trips(id,family_id,title,start_date,end_date,countries)`; `trip_stops(id,trip_id,title,country,latitude,longitude,arrive_at,depart_at,sequence,summary,source_reference)`; `routes(id,trip_id,from_stop_id,to_stop_id,distance_km,duration_minutes,duration_source)`.
- `stays(id,trip_id,stop_id,name,address,check_in,check_out,booking_status,quote_status,price_minor,currency,booking_ref,contact,notes)`.
- `bookings(id,trip_id,stop_id,stay_id,kind,title,booking_status,deadline_at,amount_minor,currency,reference,provider)`; `documents(id,family_id,booking_id,stay_id,storage_path,original_name,mime_type,classification,access_level)`.
- `payments(id,family_id,booking_id,stay_id,amount_minor,currency,paid_at,verification_status,source_document_id,notes)`; `action_items(id,family_id,trip_id,stay_id,booking_id,title,status,owner_user_id,due_at,priority)`.
- `journal_entries(id,trip_id,stop_id,author_user_id,entry_date,title,body,visibility)`; `media_assets(id,family_id,trip_id,stop_id,journal_entry_id,uploaded_by,kind,storage_path,captured_at,mime_type,size_bytes,caption,visibility)`; `voice_transcripts(id,media_id,provider,body,language,status)`.
- `wildlife_species(id,common_name_de,scientific_name)`; `wildlife_sightings(id,trip_id,stop_id,species_id,seen_at,recorded_by,count,notes,media_id)`.
- `expenses(id,trip_id,category,amount_minor,currency,spent_at,booking_id,payment_id,entered_by)`; `fx_rates(id,from_currency,to_currency,rate,as_of,source)`.
- `travel_tips(id,stop_id,title,body,category,source_type,source_reference,verified_at,warning_level)`; `emergency_contacts(id,trip_id,name,phone,type,notes)`; `sync_mutations(id,family_id,device_id,mutation_id,entity_type,entity_id,base_version,payload,status)`; `sync_conflicts(id,mutation_id,entity_type,entity_id,local_value,remote_value,resolved_at)`.

Zod-Schemas für alle Felder und DB-Abfragen erzeugen. Geld ausschließlich signed 64-bit minor units, ISO-4217 currency; niemals Float-Beträge speichern. `remaining = max(0, confirmed_amount - verified_payments)` nur bei gleicher Währung und bestätigter Preisinformation; sonst `unbekannt`. Überzahlung gesondert anzeigen, nicht wegkappen. Zahlungen mit status `unverified` nicht als sicher geleistet rechnen. Mehrwährungszahlungen brauchen belegte Umrechnung/Zuordnung.
