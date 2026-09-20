import mysql.connector


def get_db_connection():
    try:
        connection = mysql.connector.connect(
            host="127.0.0.1",
            user="root",
            password="Sparrow@2125",
            database="vendoraa_db",
            use_pure=True
        )

        print("MySQL Connected Successfully")
        return connection

    except Exception as e:
        print("MySQL Connection Error:", e)
        return None