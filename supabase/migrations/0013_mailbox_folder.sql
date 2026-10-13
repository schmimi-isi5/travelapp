-- 0013: the mailbox access names the IMAP folder to read (a subfolder instead of the inbox).
alter table public.mailbox_settings add column if not exists folder text not null default 'INBOX';
alter table public.mailbox_settings drop constraint if exists mailbox_settings_folder_check;
alter table public.mailbox_settings add constraint mailbox_settings_folder_check check (length(folder) between 1 and 200);
