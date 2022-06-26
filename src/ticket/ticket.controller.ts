import {
  Body,
  Controller,
  Get,
  HttpException,
  Param,
  Post,
} from '@nestjs/common';
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { TicketBuyCheckDto } from 'src/dtos/ticket-buy-check.dto';
import { TicketService } from './ticket.service';

@ApiTags('ticket')
@Controller('ticket')
export class TicketController {
  constructor(private readonly ticketService: TicketService) { }

  @Post('')
  @ApiOperation({
    summary: 'Check signature validity before minting a ticket token',
    description:
      'Requests the server to check the signature validity before minting a ticket token',
  })
  @ApiResponse({
    status: 201,
    description: 'Signature check pass',
    type: Number,
  })
  @ApiResponse({
    status: 401,
    description: 'Missing signature',
    type: HttpException,
  })
  @ApiResponse({
    status: 403,
    description: 'Wrong signature',
    type: HttpException,
  })
  @ApiResponse({
    status: 500,
    description: 'Invalid signature',
    type: HttpException,
  })
  async checkBuyerSignature(@Body() ticketBuyCheckDto: TicketBuyCheckDto) {
    const signature = ticketBuyCheckDto.signature;
    if (!signature || signature.length == 0)
      throw new HttpException('Missing signature', 401);
    let signatureValid = false;
    try {
      signatureValid = this.ticketService.checkSignature(ticketBuyCheckDto);
    } catch (error) {
      throw new HttpException("Invalid signature: " + error.message, 500);
    }
    if (!signatureValid) throw new HttpException('Signature does not match with the requested address', 403);
    return signatureValid;
  }

  @Get('/:ticketId')
  @ApiOperation({
    summary: 'Request a ticket uri from IPFS to the provided ticketId',
    description:
      '1. Checks the balance of this account to ensure it has none-zero ticket. 2. If pass, server generates an unique ticket image and uploads to IPFS. 3. Uploads {name, id, ticketType,  signedHash, imageURI} to IPFS and return the jsonURI to frontend.',
  })
  @ApiResponse({
    status: 200,
    description: 'Gets ticket metadata jsonURI',
    type: Number,
  })
  @ApiResponse({
    status: 503,
    description: 'The server is not configured correctly',
    type: HttpException,
  })
  async getTicket(@Param('ticketId') ticketId: string) {
    const userAddress = this.ticketService.getAddressById(ticketId);
    const tokenBalance = await this.ticketService.tokenBalanceOf(userAddress);
    let ticketJsonURI;
    if (tokenBalance > 0) {
      ticketJsonURI = await this.ticketService.getTicket(ticketId);
    }
    return ticketJsonURI;
  }

  @Get('')
  @ApiOperation({
    summary: 'All tickets sold for the event',
    description: 'Gets all tickets stored of this event on this server',
  })
  @ApiResponse({
    status: 200,
    description: 'All tickets',
  })
  @ApiResponse({
    status: 503,
    description: 'The server is not configured correctly',
    type: HttpException,
  })
  async getTickets() {
    try {
      const result = this.ticketService.getTickets();
      return result;
    } catch (error) {
      throw new HttpException(error.message, 503);
    }
  }

  // @Get('/')
  // @ApiOperation({
  //   summary: 'Register ticket metadata',
  //   description: 'Registers detailed info for a ticket',
  // })
  // @ApiResponse({
  //   status: 201,
  //   description: 'Ticket registered',
  // })
  // @ApiResponse({
  //   status: 503,
  //   description: 'Server Error',
  //   type: HttpException,
  // })
  // setTicketData(@Param('eventId') eventId: number, @Body() body: TicketdataDto) {
  //   const updatedObj = this.ticketService.setTicketData(eventId, body);
  //   return updatedObj;
  // }
}
