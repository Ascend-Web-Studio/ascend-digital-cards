CREATE TABLE card_workspace_images (
 owner_id TEXT NOT NULL,
 id TEXT NOT NULL,
 data_uri TEXT NOT NULL,
 PRIMARY KEY(owner_id,id)
);

