#Worker Websocket

import websockets
import json


class Websocket:
    def __init__(self):
        pass

    async def create_websocket_server(self,handler):
        try:
            server = await websockets.serve(handler, "localhost", 8765) #se configura el server, handler es la función que se ejecuta cada vez que alguien se conecta
            await server.wait_closed()
        except Exception as error:
            print(f"Error al momento de crear el server: {error}")

# <-------------------------------------------------------------------------->        
    async def send_message(self, type, data, websocket,cliente_id):
        try:
            message = json.dumps({
                "type": type,
                "data": data,
                "id": cliente_id
            })
            await websocket.send(message)

        except Exception as error:
            print(f"Error al enviar mensaje relacionado con el audio: {error}")

# <-------------------------------------------------------------------------->    
    async def send_join_notification(self, websocket, cliente_id):
        try:
            message = json.dumps({
                "type": "join_notification",
                "data": f"Nuevo usuario a entrada a la sala: {cliente_id}",
                "id": cliente_id
            })

            await websocket.send(message)

        
        except Exception as error:
            print(f"Error al enviar notificacion de entrada de usuario: {error}")

# <-------------------------------------------------------------------------->
    async def send_id_notification(self, websocket, cliente_id):
        try:
            message = json.dumps({
                "type": "id_notification",
                "data": f"el usuario: {cliente_id} se le asigno el id: {cliente_id}",
                "id": cliente_id
            })

            await websocket.send(message)

        
        except Exception as error:
            print(f"Error al enviar notificacion de envio de id: {error}")

# <-------------------------------------------------------------------------->
    async def send_users_in_connection_notification(self, websocket, users_list):
        try:
            message = json.dumps({
                "type": "users_in_connection",
                "data": users_list
            })

            await websocket.send(message)

        
        except Exception as error:
            print(f"Error al enviar notificacion de usuarios en linea: {error}")

# <-------------------------------------------------------------------------->
    async def send_exit_notification(self, websocket, user):
        try:
            message = json.dumps({
                "type": "exit_notification",
                "data": user
            })

           

            await websocket.send(message)

        
        except Exception as error:
            print(f"Error al enviar notificacion de salida de un usuario: {error}")