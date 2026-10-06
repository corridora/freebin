UPDATE users
SET storage_limit_bytes = 5242880
WHERE storage_limit_bytes = 1073741824;
