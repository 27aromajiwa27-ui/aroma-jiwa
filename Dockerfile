FROM python:3.12-slim

# Hugging Face Spaces menjalankan kontainer sebagai uid 1000, bukan root.
# Karena itu aplikasi dipasang di direktori milik user tersebut, supaya
# SQLite bisa membuat data/aroma.db saat pertama kali dijalankan.
RUN useradd -m -u 1000 user
WORKDIR /home/user/app
COPY --chown=user . /home/user/app
USER user

# PORT wajib 7860 agar cocok dengan app_port di README Space.
ENV HOST=0.0.0.0 \
    PORT=7860 \
    AJ_QUIET=1 \
    PYTHONUNBUFFERED=1

EXPOSE 7860
CMD ["python3", "run.py"]
