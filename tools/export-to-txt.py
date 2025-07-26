import os
import shutil

EXPORT_DIR = "exported"
BASE_DIR = os.getcwd()

# Ensure the export directory exists
os.makedirs(EXPORT_DIR, exist_ok=True)

for root, dirs, files in os.walk(BASE_DIR, topdown=True):
    # Skip the export directory
    skip_dirs = [EXPORT_DIR, 'chrono_analyser']
    dirs[:] = [d for d in dirs if d not in skip_dirs]
    # dirs[:] = [d for d in dirs if os.path.join(root, d) != os.path.join(BASE_DIR, EXPORT_DIR)]

    for file in files:
        if file in ["LICENSE.md", "README.md", "export-to-txt.py"]:
            continue

        src_path = os.path.join(root, file)

        # Compute the relative path from the base directory
        rel_dir = os.path.relpath(root, BASE_DIR)
        target_dir = os.path.join(EXPORT_DIR, rel_dir)

        # # Ensure target directory exists
        # os.makedirs(target_dir, exist_ok=True)

        # Construct the destination path with .txt appended

        new_filename = file + ".txt"
        dest_path = os.path.join(EXPORT_DIR, new_filename)

        # Copy the file
        shutil.copy2(src_path, dest_path)

print(f"Export complete. All files copied to '{EXPORT_DIR}' with '.txt' appended.")
