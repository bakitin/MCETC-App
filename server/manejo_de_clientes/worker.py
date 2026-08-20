#Worker Manejo de clientes


class ManejoDeClientes:
    def __init__(self):
        self.clientes = {}
        self.contador = 1

# <-------------------------------------------------------------------------->
    # def crear_id_cliente(self):
    #     try:
    #         cliente_id = f"peer_{self.contador}"
    #         self.contador += 1
    #         return cliente_id
    #     except Exception as error:
    #         print(f"Error al crear el id del cliente: {error}")

# <-------------------------------------------------------------------------->
    def añadir_cliente(self, cliente_id, websocket):
        try:
            self.clientes[cliente_id] = websocket
        except Exception as error:
            print(f"Error al añadir un cliente al diccionario de clientes: {error}")

# <-------------------------------------------------------------------------->
    def obtener_cliente(self, cliente_id):
        try:
            return self.clientes.get(cliente_id)
        except Exception as error:
            print(f"Error al obtener un cliente del diccionario de clientes: {error}")

# <-------------------------------------------------------------------------->
    def obtener_todos_los_clientes(self):
        try:
            clientes_online = list(self.clientes)
            return clientes_online
        except Exception as error:
            print(f"Error al retonarnas la lista de clientes: {error}")

# <-------------------------------------------------------------------------->
    def eliminar_cliente(self, cliente_id):
        try:
            return self.clientes.pop(cliente_id, None)
        except Exception as error:
            print(f"Error al eliminar un cliente de la lista de clientes: {error}")
            
# <-------------------------------------------------------------------------->
    def saber_clientes_conectados(self, cliente_id):
        try:
            clientes_filtrados = {
                id_cliente_a_iterar: datos
                for id_cliente_a_iterar, datos in self.clientes.items()
                if id_cliente_a_iterar != cliente_id
            }
            return clientes_filtrados
        except Exception as error:
            print(f"Error al filtrar clientes conectados: {error}")